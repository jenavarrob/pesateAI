// Pure calculation module: no DOM or browser state.
function calculateProjection(input){
  const sexFactor=input.sex==='male'?5:-161;
  const bmr=10*input.weight+6.25*input.height-5*input.age+sexFactor;
  const baseTdee=bmr*input.pal;
  const interventionTdee=bmr*input.targetPal;
  const initialFat=input.weight*input.fat/100;
  const initialLean=input.weight-initialFat;
  const points=[];
  for(let day=0;day<=input.days;day++){
    const fraction=day/input.days;
    const intake=input.intake+(input.targetIntake-input.intake)*fraction;
    const pal=input.pal+(input.targetPal-input.pal)*fraction;
    const tdee=bmr*pal;
    const energyBalance=(intake-tdee)*day;
    const change=energyBalance/7700;
    const fatChange=change*(change>=0?0.75:0.85);
    const leanChange=change-fatChange;
    points.push({day,intake,pal,weight:initialFat+initialLean+change,fat:initialFat+fatChange,lean:initialLean+leanChange});
  }
  return {points,bmr,baseTdee,interventionTdee,final:points[points.length-1]};
}
