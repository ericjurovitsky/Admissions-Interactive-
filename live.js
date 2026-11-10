(() => {
  const main=document.querySelector('.content');
  if(!main) return;
  const panel=document.createElement('section');
  panel.className='card noprint';
  panel.setAttribute('aria-label','Live CTM reporting');
  panel.style.cssText='border-left:4px solid #c1d82f;margin-bottom:18px';
  panel.innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between"><div><h3 style="margin:0">Live CTM reporting — account-wide</h3><p class="sub" style="margin:4px 0">Separate from the historical V1 snapshot below; Dazos remains unverified.</p></div><label for="live-range">Reporting window <select id="live-range"><option value="24h">24 hours</option><option value="48h">48 hours</option><option value="7d">7 days</option><option value="30d">30 days</option></select></label></div><div id="live-status" class="note" role="status">Checking secure CTM connection…</div><div id="live-metrics" class="grid3" style="margin-top:12px"></div><p class="note" id="live-foot" style="margin:10px 0 0">Refreshes every 5 minutes while this page is open. No patient-level records are displayed.</p>';
  main.prepend(panel);
  const range=panel.querySelector('#live-range');
  const status=panel.querySelector('#live-status');
  const metrics=panel.querySelector('#live-metrics');
  const foot=panel.querySelector('#live-foot');
  let request=0;
  function metric(name,value,detail){
    const box=document.createElement('div');
    box.className='minicard';
    const label=document.createElement('b');label.textContent=name;
    const num=document.createElement('strong');num.style.cssText='display:block;font-size:27px;color:#14304f';num.textContent=value;
    const sub=document.createElement('span');sub.textContent=detail;
    box.append(label,num,sub);return box;
  }
  async function refresh(){
    const id=++request;status.textContent='Refreshing CTM…';
    try{
      const response=await fetch('/api/ctm/summary?range='+encodeURIComponent(range.value),{cache:'no-store'});
      const data=await response.json();
      if(id!==request)return;
      if(!response.ok || data.status!=='live'){
        status.textContent='Live data unavailable — '+(data.reason||'No verified CTM response');
        metrics.replaceChildren();
        return;
      }
      status.textContent='Verified CTM response · refreshed '+new Date(data.refreshed_at).toLocaleString();
      metrics.replaceChildren(
        metric('Inbound calls',data.inbound_calls,'Account-wide, '+range.options[range.selectedIndex].text),
        metric('Answered calls',data.answered_calls,'CTM answered status'),
        metric('Missed calls',data.missed_calls,'CTM missed/unanswered status'),
        metric('Scored calls',data.scored_calls,'Numeric CTM score available'),
        metric('Qualified scored',data.qualified_scored_calls,'Score greater than 2'),
        metric('Dazos admissions','—','Historical read not verified')
      );
      foot.textContent='Live account-wide aggregates only. Other call statuses may exist; scored calls are not necessarily unique leads. Historical snapshot below does not update with this panel. Last refresh: '+new Date(data.refreshed_at).toLocaleString()+'.';
    }catch{
      if(id!==request)return;
      status.textContent='Live data unavailable — network or authentication error';
      metrics.replaceChildren();
    }
  }
  range.addEventListener('change',refresh);
  refresh();
  setInterval(()=>{if(!document.hidden)refresh();},300000);
})();
