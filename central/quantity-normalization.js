/* Conversão de lançamento de itens contratados por verba (VB) para apresentação física.
   Fonte: ObraControl registra VB em percentual (0..100), com meta 100%.
   A Central apresenta 1 VB como meta, convertendo 38% em 0,38 VB.
   Não modifica lançamentos salvos, BMs ou RDOs no Supabase. */
((root)=>{
  "use strict";
  const n=value=>Number.isFinite(Number(value))?Number(value):0;
  const isVerba=item=>String(item?.unit||"").trim().toLowerCase()==="vb";
  const isPercentualVB=(item,config)=>{
    if(!isVerba(item))return false;
    return !config||String(config.unit||"%").trim()==="%";
  };
  const quantity=(item,config,raw)=>{
    const value=n(raw);
    return isPercentualVB(item,config)?Number((value/100).toFixed(10)):value;
  };
  const goal=(item,config)=>{
    if(isPercentualVB(item,config)){
      const planned=n(item?.planned);
      return {planned:planned>0?planned:1,unit:"VB",percentControlled:true};
    }
    return {
      planned:config?.planned!=null?n(config.planned):n(item?.planned),
      unit:String(config?.unit||item?.unit||""),
      percentControlled:false
    };
  };
  root.RL_QUANTITY=Object.freeze({isVerba,isPercentualVB,quantity,goal});
})(window);
