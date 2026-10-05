from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
import hashlib
from pathlib import Path
import secrets
import sqlite3
import re
import unicodedata
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).parent
PROJECT_DIR = BASE_DIR.parent
NUTRITION_DB = PROJECT_DIR / "data" / "nutrition.sqlite"
USERS_DB = PROJECT_DIR / "data" / "users.sqlite"
SESSION_COOKIE = "pesate_session"
SESSION_DAYS = 14
PASSWORD_ITERATIONS = 310_000
app = FastAPI(title="Weigh IT - proof of concept", version="0.1.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class TimelineRecord(BaseModel):
    start: str
    end: str


class WeightRecord(BaseModel):
    id: str = Field(max_length=100)
    date: str
    kg: float = Field(gt=0, le=500)


class FoodRecord(BaseModel):
    id: str = Field(max_length=100)
    date: str
    name: str = Field(max_length=300)
    quantity: float | None = None
    unit: str | None = Field(default=None, max_length=80)
    cups: str | float | None = None
    referenceQuantity: float | None = None
    referenceMeasure: str | None = Field(default=None, max_length=200)
    referenceKcal: float | None = None
    totalKcal: float = Field(ge=0, le=100000)
    measure: str | None = Field(default=None, max_length=200)


class ActivityRecord(BaseModel):
    id: str = Field(max_length=100)
    date: str
    activity: str = Field(max_length=300)
    kcalKgMin: float = Field(ge=0, le=100)
    kcalLbMin: float | None = None
    minutes: float = Field(gt=0, le=1440)
    weightKg: float = Field(gt=0, le=500)
    totalKcal: float = Field(ge=0, le=100000)


class UserDataPayload(BaseModel):
    timeline: TimelineRecord | None = None
    weights: list[WeightRecord] = Field(default_factory=list, max_length=5000)
    foods: list[FoodRecord] = Field(default_factory=list, max_length=10000)
    activities: list[ActivityRecord] = Field(default_factory=list, max_length=10000)


def _users_connection() -> sqlite3.Connection:
    USERS_DB.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(USERS_DB)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _initialize_users_database() -> None:
    with _users_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                timeline_start TEXT,
                timeline_end TEXT
            );
            CREATE TABLE IF NOT EXISTS weight_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                entry_date TEXT NOT NULL,
                weight_kg REAL NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS food_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                entry_date TEXT NOT NULL,
                food_name TEXT NOT NULL,
                quantity REAL,
                unit TEXT,
                legacy_cups TEXT,
                reference_quantity REAL,
                reference_measure TEXT,
                reference_kcal REAL,
                total_kcal REAL NOT NULL,
                measure TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS activity_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                entry_date TEXT NOT NULL,
                activity TEXT NOT NULL,
                kcal_kg_min REAL NOT NULL,
                kcal_lb_min REAL,
                minutes REAL NOT NULL,
                weight_kg REAL NOT NULL,
                total_kcal REAL NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_weight_user_date ON weight_entries(user_id, entry_date);
            CREATE INDEX IF NOT EXISTS idx_food_user_date ON food_entries(user_id, entry_date);
            CREATE INDEX IF NOT EXISTS idx_activity_user_date ON activity_entries(user_id, entry_date);
            """
        )


def _password_digest(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS).hex()


def _validate_entry_date(value: str) -> str:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date().isoformat()
    except ValueError as error:
        raise HTTPException(status_code=422, detail=f"Invalid date: {value}") from error


def _session_user(request: Request) -> sqlite3.Row | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = int(datetime.now(timezone.utc).timestamp())
    with _users_connection() as connection:
        return connection.execute(
            "SELECT users.id, users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?",
            (token_hash, now),
        ).fetchone()


def _require_user(request: Request) -> sqlite3.Row:
    user = _session_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def _create_session(response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=SESSION_DAYS)
    with _users_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(now.timestamp()),))
        connection.execute(
            "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
            (token_hash, user_id, int(expires.timestamp()), now.isoformat()),
        )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


_initialize_users_database()

@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> Any:
    user = _session_user(request)
    template = "human3.html" if user else "auth.html"
    return templates.TemplateResponse(request=request, name=template, context={"now": datetime.now().strftime("%d.%m.%Y %H:%M"), "user": user})

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "app": "weigh-it-poc"}


@app.post("/api/auth/register")
async def register(credentials: Credentials, response: Response) -> dict[str, Any]:
    username = credentials.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9._@-]{3,64}", username):
        raise HTTPException(status_code=422, detail="Use 3-64 letters, numbers, dots, underscores, @ or hyphens")
    salt = secrets.token_bytes(16)
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        with _users_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO users(username,password_hash,password_salt,created_at) VALUES(?,?,?,?)",
                (username, _password_digest(credentials.password, salt), salt.hex(), created_at),
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="That username is already registered") from error
    _create_session(response, int(user_id))
    return {"id": user_id, "username": username}


@app.post("/api/auth/login")
async def login(credentials: Credentials, response: Response) -> dict[str, Any]:
    with _users_connection() as connection:
        user = connection.execute(
            "SELECT id,username,password_hash,password_salt FROM users WHERE username=? COLLATE NOCASE",
            (credentials.username.strip(),),
        ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    candidate = _password_digest(credentials.password, bytes.fromhex(user["password_salt"]))
    if not secrets.compare_digest(candidate, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    _create_session(response, int(user["id"]))
    return {"id": user["id"], "username": user["username"]}


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response) -> dict[str, bool]:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with _users_connection() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode("utf-8")).hexdigest(),))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
async def auth_me(request: Request) -> dict[str, Any]:
    user = _require_user(request)
    return {"id": user["id"], "username": user["username"]}


@app.get("/api/user/data")
async def user_data(request: Request) -> dict[str, Any]:
    user = _require_user(request)
    user_id = int(user["id"])
    with _users_connection() as connection:
        settings = connection.execute("SELECT timeline_start,timeline_end FROM user_settings WHERE user_id=?", (user_id,)).fetchone()
        weights = [
            {"id": row["client_id"], "date": row["entry_date"], "kg": row["weight_kg"]}
            for row in connection.execute("SELECT client_id,entry_date,weight_kg FROM weight_entries WHERE user_id=? ORDER BY entry_date", (user_id,))
        ]
        foods = [
            {
                "id": row["client_id"], "date": row["entry_date"], "name": row["food_name"],
                "quantity": row["quantity"], "unit": row["unit"], "cups": row["legacy_cups"],
                "referenceQuantity": row["reference_quantity"], "referenceMeasure": row["reference_measure"],
                "referenceKcal": row["reference_kcal"], "totalKcal": row["total_kcal"], "measure": row["measure"],
            }
            for row in connection.execute("SELECT * FROM food_entries WHERE user_id=? ORDER BY entry_date,id", (user_id,))
        ]
        activities = [
            {
                "id": row["client_id"], "date": row["entry_date"], "activity": row["activity"],
                "kcalKgMin": row["kcal_kg_min"], "kcalLbMin": row["kcal_lb_min"],
                "minutes": row["minutes"], "weightKg": row["weight_kg"], "totalKcal": row["total_kcal"],
            }
            for row in connection.execute("SELECT * FROM activity_entries WHERE user_id=? ORDER BY entry_date,id", (user_id,))
        ]
    timeline = {"start": settings["timeline_start"], "end": settings["timeline_end"]} if settings and settings["timeline_start"] and settings["timeline_end"] else None
    return {"user": {"id": user_id, "username": user["username"]}, "timeline": timeline, "weights": weights, "foods": foods, "activities": activities}


@app.put("/api/user/data")
async def sync_user_data(payload: UserDataPayload, request: Request) -> dict[str, bool]:
    user = _require_user(request)
    user_id = int(user["id"])
    now = datetime.now(timezone.utc).isoformat()
    if payload.timeline:
        start = _validate_entry_date(payload.timeline.start)
        end = _validate_entry_date(payload.timeline.end)
        if (datetime.strptime(end, "%Y-%m-%d") - datetime.strptime(start, "%Y-%m-%d")).days not in range(0, 180):
            raise HTTPException(status_code=422, detail="Timeline must contain between 1 and 180 days")
    else:
        start = end = None
    with _users_connection() as connection:
        connection.execute("DELETE FROM weight_entries WHERE user_id=?", (user_id,))
        connection.execute("DELETE FROM food_entries WHERE user_id=?", (user_id,))
        connection.execute("DELETE FROM activity_entries WHERE user_id=?", (user_id,))
        if start and end:
            connection.execute(
                "INSERT INTO user_settings(user_id,timeline_start,timeline_end) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET timeline_start=excluded.timeline_start,timeline_end=excluded.timeline_end",
                (user_id, start, end),
            )
        connection.executemany(
            "INSERT INTO weight_entries(client_id,user_id,entry_date,weight_kg,created_at) VALUES(?,?,?,?,?)",
            [(row.id, user_id, _validate_entry_date(row.date), row.kg, now) for row in payload.weights],
        )
        connection.executemany(
            "INSERT INTO food_entries(client_id,user_id,entry_date,food_name,quantity,unit,legacy_cups,reference_quantity,reference_measure,reference_kcal,total_kcal,measure,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                (row.id, user_id, _validate_entry_date(row.date), row.name, row.quantity, row.unit, str(row.cups) if row.cups is not None else None, row.referenceQuantity, row.referenceMeasure, row.referenceKcal, row.totalKcal, row.measure, now)
                for row in payload.foods
            ],
        )
        connection.executemany(
            "INSERT INTO activity_entries(client_id,user_id,entry_date,activity,kcal_kg_min,kcal_lb_min,minutes,weight_kg,total_kcal,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            [
                (row.id, user_id, _validate_entry_date(row.date), row.activity, row.kcalKgMin, row.kcalLbMin, row.minutes, row.weightKg, row.totalKcal, now)
                for row in payload.activities
            ],
        )
    return {"ok": True}


def _nutrition_tables(connection: sqlite3.Connection) -> list[tuple[str, list[str]]]:
    tables = connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
    result = []
    for (table_name,) in tables:
        columns = [row[1] for row in connection.execute(f'PRAGMA table_info("{table_name.replace(chr(34), chr(34) * 2)}")')]
        if columns:
            result.append((table_name, columns))
    return result


@app.get("/api/nutrition/search")
async def nutrition_search(q: str = Query(default="", max_length=120)) -> JSONResponse:
    """Search the local nutrition catalogue without assuming its schema."""
    if not NUTRITION_DB.exists():
        return JSONResponse({"items": [], "error": f"Nutrition database not found: {NUTRITION_DB}"}, status_code=404)
    search = q.strip()
    if len(search) < 2:
        return JSONResponse({"items": []})
    items = []
    with sqlite3.connect(NUTRITION_DB) as connection:
        connection.row_factory = sqlite3.Row
        for table_name, columns in _nutrition_tables(connection):
            text_columns = [column for column in columns if any(token in column.lower() for token in ("name", "food", "description", "product", "item"))]
            if not text_columns:
                text_columns = columns
            kcal_columns = [column for column in columns if any(token in column.lower() for token in ("kcal", "calorie", "energy"))]
            safe_table = table_name.replace('"', '""')
            safe_columns = [column.replace('"', '""') for column in text_columns]
            where = " OR ".join(f'LOWER(CAST("{column}" AS TEXT)) LIKE LOWER(?)' for column in safe_columns)
            parameters = [f"%{search}%"] * len(safe_columns)
            rows = connection.execute(f'SELECT * FROM "{safe_table}" WHERE {where} LIMIT 25', parameters).fetchall()
            for row in rows:
                data = dict(row)
                name = next((str(data[column]) for column in text_columns if data.get(column) not in (None, "")), table_name)
                kcal = next((data[column] for column in kcal_columns if data.get(column) not in (None, "")), None)
                items.append({"id": f"{table_name}:{row[0]}", "name": name, "kcal": kcal, "source": table_name, "data": data})
                if len(items) >= 50:
                    return JSONResponse({"items": items})
    return JSONResponse({"items": items})


CATALOGUE_TABLES = ("food1", "food2", "food3", "food4")
SPANISH_FOOD_TERMS = {
    "arroz": "rice", "carne": "meat beef", "res": "beef", "cerdo": "pork",
    "pollo": "chicken", "pavo": "turkey", "pescado": "fish", "leche": "milk",
    "queso": "cheese", "huevo": "egg", "huevos": "egg", "pan": "bread",
    "trigo": "wheat", "harina": "flour", "integral": "whole wheat",
    "pasta": "pasta", "espagueti": "spaghetti", "espaguetis": "spaghetti",
    "brocoli": "broccoli", "brócoli": "broccoli", "sopa": "soup",
    "pastel": "cake", "tarta": "cake", "chocolate": "chocolate",
    "manzana": "apple", "platano": "banana", "plátano": "banana",
    "naranja": "orange", "fresa": "strawberry", "uvas": "grape",
    "papa": "potato", "patata": "potato", "tomate": "tomato",
    "cebolla": "onion", "zanahoria": "carrot", "frijol": "bean",
    "frijoles": "beans", "lentejas": "lentils", "avena": "oat",
    "mantequilla": "butter", "aceite": "oil", "azucar": "sugar",
    "azúcar": "sugar", "cereal": "cereal", "ensalada": "salad",
}

SPANISH_ACTIVITY_TERMS = {
    "caminar": "walking", "caminata": "walking", "andar": "walking",
    "correr": "running", "carrera": "running", "trotar": "jogging",
    "ciclismo": "bicycling", "bicicleta": "bicycling", "nadar": "swimming",
    "natacion": "swimming", "natación": "swimming", "futbol": "soccer",
    "fútbol": "soccer", "baloncesto": "basketball", "tenis": "tennis",
    "baile": "dancing", "bailar": "dancing", "yoga": "yoga",
    "pesas": "weight lifting", "jardineria": "gardening",
    "jardinería": "gardening", "limpieza": "cleaning", "escaleras": "stairs",
}


def _catalogue_path() -> Path | None:
    candidates = (
        PROJECT_DIR / "data" / "nutrition.sqlite",
        BASE_DIR / "data" / "nutrition.sqlite",
    )
    return next((path for path in candidates if path.is_file()), None)


def _catalogue_connection() -> sqlite3.Connection:
    path = _catalogue_path()
    if path is None:
        raise FileNotFoundError("nutrition.sqlite was not found in project/data or fastapi_poc/data")
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def _search_variants(query: str) -> list[str]:
    normalized = _normalize_food_text(query)
    singular = " ".join(_singularize_token(word) for word in normalized.split())
    variants = [normalized, singular]
    translated_parts = [SPANISH_FOOD_TERMS.get(word, word) for word in normalized.split()]
    translated = " ".join(translated_parts)
    if translated and translated != normalized:
        variants.append(translated)
        variants.append(" ".join(_singularize_token(word) for word in translated.split()))
    return list(dict.fromkeys(variant for variant in variants if variant))


def _normalize_food_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


def _singularize_token(token: str) -> str:
    """Generate a conservative English/Spanish singular search variant."""
    if len(token) <= 3:
        return token
    if token.endswith("ies") and len(token) > 4:
        return token[:-3] + "y"
    if token.endswith(("ches", "shes", "sses", "xes", "zes", "oes")):
        return token[:-2]
    if token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _food_similarity(query: str, description: str) -> float:
    """Rank concise, complete matches above longer descriptions with incidental matches."""
    query_normalized = _normalize_food_text(query)
    description_normalized = _normalize_food_text(description)
    if not query_normalized or not description_normalized:
        return 0.0
    if query_normalized == description_normalized:
        return 1.0
    query_tokens = query_normalized.split()
    description_tokens = description_normalized.split()
    available = list(description_tokens)
    token_scores = []
    matched = 0
    for query_token in query_tokens:
        if not available:
            token_scores.append(0.0)
            continue
        similarities = [SequenceMatcher(None, query_token, token).ratio() for token in available]
        best_index = max(range(len(similarities)), key=similarities.__getitem__)
        best = similarities[best_index]
        token_scores.append(best)
        if best >= 0.72:
            matched += 1
            available.pop(best_index)
    coverage = sum(token_scores) / len(query_tokens)
    precision = matched / max(len(description_tokens), 1)
    sequence = SequenceMatcher(None, query_normalized, description_normalized).ratio()
    phrase_bonus = 0.08 if query_normalized in description_normalized else 0.0
    prefix_bonus = 0.04 if description_normalized.startswith(query_normalized) else 0.0
    extra_word_penalty = min(0.24, max(0, len(description_tokens) - len(query_tokens)) * 0.035)
    return max(0.0, 0.66 * coverage + 0.24 * precision + 0.10 * sequence + phrase_bonus + prefix_bonus - extra_word_penalty)


@app.get("/api/catalogue/tables")
async def catalogue_tables() -> JSONResponse:
    try:
        with _catalogue_connection() as connection:
            available = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            tables = []
            for table in CATALOGUE_TABLES:
                if table in available:
                    count = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
                    tables.append({"name": table, "count": count})
            return JSONResponse({"tables": tables, "database": str(_catalogue_path())})
    except (sqlite3.Error, FileNotFoundError) as error:
        return JSONResponse({"tables": [], "error": str(error)}, status_code=500)


@app.get("/api/catalogue/items")
async def catalogue_items(
    table: str,
    q: str = Query(default="", max_length=120),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=250, ge=1, le=500),
) -> JSONResponse:
    if table not in CATALOGUE_TABLES:
        return JSONResponse({"items": [], "error": "Unknown catalogue table"}, status_code=400)
    try:
        with _catalogue_connection() as connection:
            variants = _search_variants(q) if q.strip() else []
            where = ""
            parameters: list[Any] = []
            if variants:
                where = " WHERE " + " OR ".join("LOWER(Shrt_Desc) LIKE ?" for _ in variants)
                parameters.extend(f"%{variant}%" for variant in variants)
            total = connection.execute(f'SELECT COUNT(*) FROM "{table}"{where}', parameters).fetchone()[0]
            rows = connection.execute(
                f'SELECT rowid AS item_id, Shrt_Desc, Energ_Kcal, GmWt_Desc1 FROM "{table}"{where} ORDER BY Shrt_Desc LIMIT ? OFFSET ?',
                [*parameters, limit, offset],
            ).fetchall()
            return JSONResponse({"table": table, "total": total, "offset": offset, "items": [dict(row) for row in rows]})
    except (sqlite3.Error, FileNotFoundError) as error:
        return JSONResponse({"items": [], "error": str(error)}, status_code=500)


@app.get("/api/catalogue/search")
async def catalogue_search(q: str = Query(default="", min_length=2, max_length=120)) -> JSONResponse:
    try:
        variants = _search_variants(q)
        items = []
        with _catalogue_connection() as connection:
            available = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            for table in CATALOGUE_TABLES:
                if table not in available:
                    continue
                search_terms = list(dict.fromkeys(term for variant in variants for term in variant.split()))
                where = " OR ".join("LOWER(Shrt_Desc) LIKE ?" for _ in search_terms)
                rows = connection.execute(
                    f'SELECT rowid AS item_id, Shrt_Desc, Energ_Kcal, GmWt_Desc1 FROM "{table}" WHERE {where} LIMIT 500',
                    [f"%{term}%" for term in search_terms],
                ).fetchall()
                for row in rows:
                    item = {**dict(row), "table": table}
                    item["similarity"] = max(_food_similarity(variant, item["Shrt_Desc"]) for variant in variants)
                    items.append(item)
        items.sort(
            key=lambda item: (
                -item["similarity"],
                len(_normalize_food_text(item["Shrt_Desc"]).split()),
                _normalize_food_text(item["Shrt_Desc"]),
            )
        )
        return JSONResponse({"query": q, "variants": variants, "items": items[:120]})
    except (sqlite3.Error, FileNotFoundError) as error:
        return JSONResponse({"items": [], "error": str(error)}, status_code=500)


def _activity_variants(query: str) -> list[str]:
    normalized = _normalize_food_text(query)
    translated = " ".join(SPANISH_ACTIVITY_TERMS.get(word, word) for word in normalized.split())
    return list(dict.fromkeys(value for value in (normalized, translated) if value))


def _activity_item(row: sqlite3.Row) -> dict[str, Any]:
    value = row["kcal_lb_min"]
    try:
        kcal_lb_min = float(value)
        kcal_kg_min = kcal_lb_min * 2.2046226218
    except (TypeError, ValueError):
        kcal_lb_min = value
        kcal_kg_min = None
    return {
        "item_id": row["item_id"],
        "activity": row["activity"],
        "kcal_lb_min": kcal_lb_min,
        "kcal_kg_min": kcal_kg_min,
    }


@app.get("/api/physical-activity/items")
async def physical_activity_items(
    q: str = Query(default="", max_length=120),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=250, ge=1, le=500),
) -> JSONResponse:
    try:
        variants = _activity_variants(q) if q.strip() else []
        with _catalogue_connection() as connection:
            table_exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='physical_activity'"
            ).fetchone()
            if not table_exists:
                return JSONResponse({"items": [], "error": "Table physical_activity was not found"}, status_code=404)
            rows = connection.execute(
                'SELECT rowid AS item_id, activity, kcal_lb_min FROM physical_activity'
            ).fetchall()
            items = [_activity_item(row) for row in rows]
            if variants:
                for item in items:
                    item["similarity"] = max(_food_similarity(variant, item["activity"]) for variant in variants)
                query_terms = {term for variant in variants for term in variant.split()}
                items = [
                    item for item in items
                    if item["similarity"] >= 0.38
                    or any(term in _normalize_food_text(item["activity"]) for term in query_terms)
                ]
                items.sort(key=lambda item: (-item["similarity"], len(_normalize_food_text(item["activity"]).split()), _normalize_food_text(item["activity"])))
            else:
                items.sort(key=lambda item: _normalize_food_text(item["activity"]))
            total = len(items)
            page = items[offset:offset + limit]
            return JSONResponse({"items": page, "total": total, "offset": offset, "variants": variants})
    except (sqlite3.Error, FileNotFoundError) as error:
        return JSONResponse({"items": [], "error": str(error)}, status_code=500)
