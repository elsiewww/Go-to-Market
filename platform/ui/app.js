const navGroups = [
  ["工作空间", [["overview","运营总览","overview"],["agents","智能体工作区","team"],["tasks","任务与运行","tasks"]]],
  ["营销运营", [["content","内容审核","content"],["outreach","触达与回复","mail"],["growth","增长与 Beta","growth"]]],
  ["资料", [["knowledge","知识与来源","book"]]]
];
const navItems = navGroups.flatMap(([,items]) => items);
const descriptions = {
  overview:"查看待审交付、执行队列和团队工作区。",
  agents:"按职责查看各级智能体的模型、知识和交付记录。",
  tasks:"跟踪任务队列、运行结果和已登记的调度。",
  content:"核对来源、编辑内容，并记录审核决定。",
  outreach:"审核合作触达与来信回复，保留每一次修改。",
  growth:"审阅增长实验、渠道计划与 Beta 运营材料。",
  knowledge:"检索团队知识、来源与支持交付的证据。"
};
const kindLabels = {agent:"智能体",task:"任务",run:"运行",evidence:"证据",content:"内容",outreach:"触达草稿",reply:"回复草稿",knowledge:"知识",source:"来源",schedule:"调度",growth:"增长项目"};
const statusLabels = {
  prepared:"已配置",prepared_not_created:"已配置",available:"可用",blocked:"受阻",completed:"已完成",
  queued:"已排队",running:"运行中",failed:"失败",captured:"已采集",verified:"已核验",unverified:"待核验",
  draft:"草稿",needs_review:"待审核",approved:"已批准",changes_requested:"待修改",reference:"参考资料",
  configured:"已配置",unavailable:"不可用",manual:"手动",disabled:"已停用",enabled:"已启用",paused:"已暂停",
  sent:"已发送",published:"已发布",unconnected:"未连接",not_connected:"未连接",ready:"就绪"
};
const detailLabels = {
  level:"层级",reportsTo:"上级",rolePath:"角色说明",knowledgePath:"知识目录",workspacePath:"工作目录",outputPath:"交付目录",model:"模型",requiredModel:"要求模型",resolvedModel:"已核实模型",sessionId:"会话编号",threadId:"线程编号",channel:"渠道",product:"产品",url:"来源链接",reason:"原因",blocker:"阻碍",blockers:"阻碍",limitations:"限制",nextAction:"下一步",schedule:"计划",timezone:"时区",observedAt:"核验时间",title:"标题",category:"分类",scope:"职责",owner:"负责人",audience:"受众",source:"来源",publicationDate:"发布日期",metric:"指标",budget:"预算",evidence:"证据",children:"下级",runtime:"运行环境",inputRefs:"输入引用",outputRefs:"交付引用",path:"路径",sourcePath:"来源路径",destination:"目标渠道",artifactPath:"产物路径",required_model:"要求模型",resolved_model:"已核实模型",reports_to:"上级",asOf:"截至",scheduleId:"调度编号",role:"职责",priority:"优先级",confidence:"可信度",scheduleEnabled:"调度状态"
};
Object.assign(detailLabels, {
  taskPath:"任务路径",sidebarChatId:"侧栏会话",roles:"相关角色",runId:"运行记录",taskId:"关联任务",legalStatus:"法律状态",
  entityKey:"对象编号",interest:"意向依据",contactRoute:"联系渠道",fit:"匹配依据",signal:"公开信号",recency:"时效性",contactability:"可联系性",
  publicationStatus:"发布状态",actualSend:"已实际发送",subject:"消息主题",hypothesis:"合作假设",sentAt:"发送时间",verificationStatus:"核验情况",
  participants:"已登记参与者",sessionsStarted:"已开始体验",sessionsCompleted:"已完成体验",completionRate:"体验完成率",proposedCapacity:"拟定名额",
  spendThisRun:"本轮支出",lastRun:"上次运行"
});
const icoPaths = {
  overview:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  team:"M12 4v4 M5 11V8h14v3 M3 13h5v6H3z M10 2h4v3h-4z M16 13h5v6h-5z",
  tasks:"M9 5h12 M9 12h12 M9 19h12 M2 5l1 1 2-3 M2 12l1 1 2-3 M2 19l1 1 2-3",
  content:"M14 2H5v20h14V7z M14 2v5h5 M8 12h8 M8 16h6",
  mail:"M3 5h18v14H3z M3 6l9 7 9-7",
  growth:"M3 20V4 M3 20h18 M7 15l4-5 3 2 6-7 M16 5h4v4",
  book:"M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1z M12 5v15",
  refresh:"M20 9a8 8 0 0 0-14-4L3 8 M3 3v5h5 M4 15a8 8 0 0 0 14 4l3-3 M21 21v-5h-5",
  plus:"M12 5v14 M5 12h14",menu:"M3 6h18 M3 12h18 M3 18h18",close:"M5 5l14 14 M19 5 5 19",
  search:"M15.5 15.5 21 21 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  check:"M4 12l5 5L20 6",clock:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l4 2",
  lock:"M5 10h14v11H5z M8 10V7a4 4 0 1 1 8 0v3",source:"M3 5h6l2 2h10v13H3z",
  alert:"M12 3 2 20h20z M12 9v5 M12 17v.1",review:"M9 4h6v3H9z M8 5H5v16h14V5h-3 M8 14l3 3 5-6",
  users:"M15 20H2v-2c0-5 13-5 13 0z M12 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0 M17 5c4 0 4 6 0 6 M17 14c3 0 5 2 5 5",
  history:"M3 11a9 9 0 1 1 2 7 M3 5v6h6 M12 7v5l4 2"
};
const reviewKinds = new Set(["content","outreach","reply","growth"]);
const pageKinds = {content:["content"],outreach:["outreach","reply"],growth:["growth"],knowledge:["knowledge","source","evidence"],tasks:["task","run","schedule"]};
const root = document.getElementById("app"), sheet = document.getElementById("sheet");
let state = null, page = currentRoute(), loading = false, error = "", menuOpen = false;
let dialogBusy = false, focusReturn = null, toastTimer = 0, filters = {}, dialogContext = null;
function h(tag,attrs,...children){
  const el=document.createElement(tag);
  for(const [key,val] of Object.entries(attrs || {})){
    if(val===false || val===null || val===undefined)continue;
    if(key==="class")el.className=val;
    else if(key.startsWith("on"))el.addEventListener(key.slice(2),val);
    else if(val===true)el.setAttribute(key,"");
    else el.setAttribute(key,String(val));
  }
  for(const child of children.flat(Infinity))if(child!==null && child!==undefined && child!==false)el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return el;
}
function icon(name) {
  const ns="http://www.w3.org/2000/svg", s=document.createElementNS(ns,"svg"), p=document.createElementNS(ns,"path");
  s.setAttribute("class","ico");s.setAttribute("viewBox","0 0 24 24");s.setAttribute("aria-hidden","true");
  p.setAttribute("d",icoPaths[name]||icoPaths.content);s.append(p);return s;
}
function brandMark(){
  const ns="http://www.w3.org/2000/svg",s=document.createElementNS(ns,"svg"),p=document.createElementNS(ns,"path");
  s.setAttribute("viewBox","0 0 32 32");s.setAttribute("aria-hidden","true");
  p.setAttribute("fill","currentColor");p.setAttribute("d","M3 23V12l6-5v11z M13 26V9l6-4v17z M23 21v-9l6-4v9z");s.append(p);
  return h("span",{class:"brand-mark"},s);
}
function btn(label, action, opts={}){
  return h("button",{type:"button",class:opts.class || "btn",onclick:action,disabled:opts.disabled,"aria-label":opts.aria || null,title:opts.aria || null},opts.icon ? icon(opts.icon):null,label);
}
function empty(title, detail){return h("div",{class:"empty"},h("strong",{},title),detail && h("p",{},detail));}
function badge(value){
  const tones={good:["available","verified","approved","completed","enabled","sent","published"],attention:["needs_review","unverified","changes_requested","unavailable","paused"],bad:["blocked","failed"],active:["running","queued","captured"]};
  return h("span",{class:"badge "+(Object.keys(tones).find(k=>tones[k].includes(value))||"")},statusLabels[value]||value||"未记录");
}
function tile(name,color){return h("span",{class:"icon-tile "+(color?"tile-"+color:"")},icon(name));}
function currentRoute(){const candidate=location.hash.slice(1);return navItems.some(([id])=>id===candidate)?candidate:"overview";}
function go(id){menuOpen=false;if(location.hash==="#"+id){render();return;}location.hash=id;}
function records(...kinds){return (state?.records||[]).filter(r=>kinds.includes(r.kind));}
function lookup(id){return (state?.records||[]).find(r=>r.id===id);}
function owner(r){return lookup(r.agentId)?.title || r.agentId || "未分配";}
function stamp(value,full=false){
  if(!value)return "未记录";const date=new Date(value);if(Number.isNaN(+date))return String(value);
  return new Intl.DateTimeFormat("zh-CN",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",...(full?{hour:"2-digit",minute:"2-digit",hour12:false}:{})}).format(date);
}
function recent(rows){return [...rows].sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""))||a.id.localeCompare(b.id));}
function pageFor(kind){return Object.keys(pageKinds).find(p=>pageKinds[p].includes(kind))||(kind==="agent"?"agents":"overview");}
function pageInfo(){return navItems.find(([id])=>id===page);}
function kindName(kind){return kindLabels[kind]||kind;}
function evidenceCount(r){return Array.isArray(r.evidence)?r.evidence.length:0;}
function isReview(r){return reviewKinds.has(r.kind);}
function filtersFor(p){return filters[p] ||= {q:"",kind:"",status:"",level:"",owner:""};}
function filteredPage(p,changes){Object.assign(filtersFor(p),{q:"",kind:"",status:"",level:"",owner:""},changes);go(p);}
function notify(message){
  clearTimeout(toastTimer);
  const host=document.getElementById("feedback");host.replaceChildren(h("div",{class:"toast"},message));
  toastTimer=setTimeout(()=>host.replaceChildren(),3800);
}
async function readState(){
  const response=await fetch("/api/state",{headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw new Error(await apiError(response));
  const data=await response.json();
  if(!Array.isArray(data.records)||!Array.isArray(data.history))throw new Error("返回的数据格式无法识别。");
  state=data;error="";
}
async function refresh(){
  if(loading)return;loading=true;error="";render();
  try{await readState();}catch(e){error=e.message;}finally{loading=false;render();}
}
async function apiError(response){
  let detail="";try{const obj=await response.json();if(typeof obj.error==="string")detail=obj.error;}catch{}
  if(response.status===409)return "记录版本或请求内容已变更。请复制需要保留的修改，关闭面板后刷新并核对。";
  if(response.status===401||response.status===403)return "当前会话没有访问权限，请检查工作台登录状态。";
  if(response.status>=500)return "数据服务暂时不可用，请稍后重试。"+(detail?" "+detail:"");
  return detail||("请求失败（HTTP "+response.status+"）。");
}
function sidebar(){
  const reviewCount=kind=>state?.records.filter(r=>pageKinds[kind]?.includes(r.kind)&&r.status==="needs_review").length;
  return h("aside",{id:"app-nav",class:"sidebar"+(menuOpen?" open":"")},h("div",{class:"brand"},brandMark(),h("div",{},h("strong",{},"Go-to-Market"),h("small",{},"营销运营工作台"))),
    h("nav",{"aria-label":"主导航"},navGroups.map(([label,items])=>h("div",{class:"nav-group"},h("h2",{},label),items.map(([id,title,i])=>{
      const n=reviewCount(id);
      return h("a",{href:"#"+id,class:"nav-link","aria-current":page===id?"page":null,onclick:()=>{if(menuOpen){menuOpen=false;render();}}},icon(i),title,n?h("span",{class:"nav-count","aria-label":n+" 项待审核"},n):null);
    })))),
    h("div",{class:"sidebar-foot"},icon("clock"),"运营时区 · 纽约"));
}
function pageAction(){
  if(page==="overview"||page==="tasks"||page==="agents")return btn("新建任务",()=>openComposer("task"),{class:"btn primary",icon:"plus"});
  if(page==="knowledge")return btn("添加知识",()=>openComposer("knowledge"),{class:"btn primary",icon:"plus"});
  return null;
}
function render(){
  document.title=pageInfo()[1]+" · GTM 运营工作台";
  const main=h("main",{id:"main-area",tabindex:"-1"});
  main.append(h("div",{class:"page-head"},h("div",{},h("h1",{},pageInfo()[1]),h("p",{},descriptions[page])),state && h("div",{class:"actions"},pageAction())));
  if(error)main.append(h("div",{class:"notice error sync-error",role:"alert"},state?"刷新失败，当前显示上次读取的数据。 ":"工作台数据读取失败。 ",error," ",btn("重试",refresh,{class:"text-btn"})));
  if(!state&&!error)main.append(h("section",{class:"panel",role:"status"},empty("正在读取工作区…","正在加载团队、任务与审核记录。")));
  if(state){
    if(page==="overview")main.append(overview());
    else main.append(collection());
  }
  const menu=btn("",()=>{menuOpen=!menuOpen;render();},{class:"icon-btn menu-toggle",aria:"打开主导航",icon:"menu"});
  menu.setAttribute("aria-controls","app-nav");menu.setAttribute("aria-expanded",String(menuOpen));
  root.replaceChildren(h("div",{class:"shell"},sidebar(),menuOpen?h("button",{type:"button",class:"nav-shade","aria-label":"关闭导航",onclick:()=>{menuOpen=false;render();}}):null,
    h("div",{class:"workspace"},h("header",{class:"topbar"},h("div",{class:"breadcrumb"},menu,h("span",{},"工作台"),h("span",{class:"crumb-sep","aria-hidden":"true"},"/"),h("strong",{},pageInfo()[1])),
      h("div",{class:"top-actions"},h("span",{class:"date"},stamp(new Date())+" · 纽约"),btn(h("span",{class:"refresh-label"},loading?"刷新中":"刷新"),refresh,{icon:"refresh",aria:"刷新工作区数据",disabled:loading}))),main)));
}
function section(title,ic,content,action=null){
  return h("section",{class:"panel"},h("div",{class:"panel-head"},h("h2",{},icon(ic),title),action),content);
}
const recordIcons={agent:"team",content:"content",reply:"mail",outreach:"mail",growth:"growth",task:"tasks",run:"clock",schedule:"clock",source:"source",knowledge:"book",evidence:"source"};
function recordRow(r,meta){
  return h("button",{type:"button",class:"item-row",onclick:()=>openRecord(r.id)},tile(recordIcons[r.kind]),h("span",{class:"row-text"},h("strong",{},r.title),h("span",{class:"meta"},meta??(kindName(r.kind)+" · "+owner(r)))),badge(r.status));
}
function overview(){
  const all=state.records, pending=recent(all.filter(r=>isReview(r)&&r.status==="needs_review")), tasks=records("task"), agents=records("agent"), sources=records("source");
  const waiting=tasks.filter(r=>r.status==="queued"), active=tasks.filter(r=>r.status==="running"), blocked=recent(all.filter(r=>["blocked","failed","unavailable"].includes(r.status)));
  const kpis=[
    ["待审核交付",pending.length,"覆盖内容、触达与增长","review","amber",()=>openList("待审核交付",pending,"暂无待审核交付","草稿提交后会进入此处。")],
    ["已排队任务",waiting.length,active.length+" 项任务正在运行","tasks","",()=>filteredPage("tasks",{kind:"task",status:"queued"})],
    ["智能体工作区",agents.length,agents.filter(r=>r.details?.level==="L1").length+" 位 L1 负责人","team","teal",()=>go("agents")],
    ["登记来源",sources.length,sources.filter(r=>r.status==="unavailable").length+" 个来源暂不可用","source","blue",()=>filteredPage("knowledge",{kind:"source"})]
  ];
  const reviewSection=section("审核收件箱","review",pending.length?pending.slice(0,5).map(r=>recordRow(r)):empty("暂无待审核交付","内容、合作消息及增长草案提交后，可在这里审核。"),pending.length?btn("查看全部",()=>openList("审核收件箱",pending),{class:"text-btn"}):null);
  const recentTasks=recent(tasks).slice(0,4);
  const taskSection=section("近期任务","tasks",recentTasks.length?recentTasks.map(r=>recordRow(r,owner(r)+" · "+stamp(r.updatedAt))):empty("队列中还没有任务","新建任务，指定负责的智能体和预期交付。"),btn("任务列表",()=>go("tasks"),{class:"text-btn"}));
  const leads=agents.filter(a=>a.details?.level==="L1");
  const teamSection=section("团队工作区","team",leads.length?leads.map(a=>h("button",{class:"item-row",type:"button",onclick:()=>openRecord(a.id)},tile("team","teal"),h("span",{class:"row-text"},h("strong",{},a.title),h("span",{class:"meta"},"L1 · "+agents.filter(child=>child.details?.reportsTo===a.id).length+" 个下级工作区")))):empty("尚未登记 L1 工作区","导入角色清单后，负责人及下级工作区会显示在这里。"),btn("全部角色",()=>go("agents"),{class:"text-btn"}));
  const issueSection=section("待处理阻碍","alert",blocked.length?blocked.slice(0,3).map(r=>recordRow(r)):empty("没有已记录的阻碍","受阻任务、失败运行和不可用来源将在此汇总。"),blocked.length>3?btn("查看全部",()=>openList("待处理阻碍",blocked),{class:"text-btn"}):null);
  return h("div",{},h("div",{class:"kpis"},kpis.map(([title,value,sub,ic,color,action])=>h("button",{class:"kpi",type:"button",onclick:action},h("span",{class:"kpi-main"},h("b",{},title),tile(ic,color)),h("strong",{},value),h("span",{class:"meta"},sub)))),
    h("div",{class:"dashboard-grid"},h("div",{class:"stack"},reviewSection,taskSection),h("div",{class:"stack"},teamSection,issueSection)));
}
function selectFilter(label,values,selected,onChange){
  const el=h("select",{"aria-label":label,onchange:e=>onChange(e.currentTarget.value)},h("option",{value:""},label),values.map(([value,title])=>h("option",{value},title)));
  el.value=selected;return el;
}
function searchable(r){return [r.id,r.title,r.body,r.agentId,owner(r),kindName(r.kind),statusLabels[r.status],JSON.stringify(r.details||{}),JSON.stringify(r.evidence||[])].join(" ").toLocaleLowerCase();}
function collection(){
  const all=page==="agents"?records("agent"):records(...pageKinds[page]), f=filtersFor(page);
  const results=h("div",{}), bar=h("div",{class:"filterbar","aria-label":"筛选记录"});
  function update(){
    const q=f.q.trim().toLocaleLowerCase();
    const items=all.filter(r=>(!q||searchable(r).includes(q))&&(!f.kind||r.kind===f.kind)&&(!f.status||r.status===f.status)&&(!f.level||r.details?.level===f.level)&&(!f.owner||r.details?.reportsTo===f.owner));
    const filtered=!!(q||f.kind||f.status||f.level||f.owner);
    const noResults=filtered?empty("没有符合条件的记录","调整搜索词或筛选条件后再试。"):empty("暂无"+pageInfo()[1]+"记录",{
      agents:"导入角色清单后，可在这里查看每个工作区。",content:"导入编辑产物，或在智能体完成任务后查看其内容交付。",outreach:"导入触达草稿或真实来信生成的回复草稿后即可审核。",growth:"已导入的增长实验、渠道和 Beta 材料将在此显示。",knowledge:"添加知识，或导入带出处的来源和证据。",tasks:"新建任务后，可在此追踪排队状态和后续运行。"
    }[page]);
    if(page==="agents"){
      const levels=[...new Set(items.map(r=>r.details?.level||"未分级"))].sort();
      results.replaceChildren(...(items.length?levels.map(level=>{
        const group=items.filter(r=>(r.details?.level||"未分级")===level);
        return h("section",{},h("div",{class:"group-title"},h("h2",{},({L0:"L0 · 战略",L1:"L1 · 运营负责人",L2:"L2 · 执行团队"})[level]||level),h("span",{},group.length+" 个工作区")),h("div",{class:"cards"},group.map(agentCard)));
      }):[h("section",{class:"panel"},noResults)]));
    }else{
      results.replaceChildren(section("记录列表",pageInfo()[2],items.length?table(recent(items),page):noResults,h("span",{class:"meta",role:"status"},items.length+" 条记录")));
    }
  }
  function setFilter(key,value){f[key]=value;update();}
  const search=h("input",{type:"search","aria-label":"搜索记录",placeholder:page==="knowledge"?"搜索标题、正文或证据引用…":"搜索标题、负责人或正文…",value:f.q,oninput:e=>setFilter("q",e.currentTarget.value)});
  bar.append(h("label",{class:"search-field"},icon("search"),search));
  if(page==="agents"){
    bar.append(selectFilter("全部层级",["L0","L1","L2"].map(v=>[v,v]),f.level,v=>setFilter("level",v)));
    const managers=records("agent").filter(r=>all.some(a=>a.details?.reportsTo===r.id));
    if(managers.length)bar.append(selectFilter("全部上级",managers.map(r=>[r.id,r.title]),f.owner,v=>setFilter("owner",v)));
  }else if(pageKinds[page].length>1){
    bar.append(selectFilter("全部类型",pageKinds[page].map(k=>[k,kindName(k)]),f.kind,v=>setFilter("kind",v)));
  }
  const statuses=[...new Set([...all.map(r=>r.status),...(f.status?[f.status]:[])])].sort();
  bar.append(selectFilter("全部状态",statuses.map(s=>[s,statusLabels[s]||s]),f.status,v=>setFilter("status",v)));
  const clear=btn("重置",()=>{filters[page]=null;render();document.querySelector(".search-field input")?.focus();},{class:"text-btn"});bar.append(clear);
  update();return h("div",{},bar,results);
}
function agentCard(r){
  const assigned=state.records.filter(x=>x.agentId===r.id), parent=lookup(r.details?.reportsTo);
  return h("button",{type:"button",class:"work-card",onclick:()=>openRecord(r.id)},h("span",{class:"card-top"},tile("team",r.details?.level==="L1"?"teal":""),badge(r.status)),
    h("span",{},h("h3",{},r.title),h("span",{class:"meta"},parent?"直属上级 · "+parent.title:r.details?.reportsTo?"直属上级 · "+r.details.reportsTo:r.id)),
    h("span",{class:"work-stats"},assigned.filter(x=>x.kind==="task").length+" 项任务  ·  "+assigned.filter(isReview).length+" 份交付  ·  "+assigned.filter(x=>x.kind==="knowledge").length+" 条知识"));
}
function deliveryState(r){
  if(r.kind==="content")return r.details?.publicationStatus || (r.status==="published"?"已发布":"无发布回执");
  if(r.status==="sent" || r.details?.sentAt)return "已记录发送";
  if(r.details?.actualSend===false || r.details?.sentAt===null)return "未发送";
  return "无发送回执";
}
function table(rows,view){
  const showDelivery=["outreach","content"].includes(view);
  return h("div",{class:"tablewrap",tabindex:"0","aria-label":"记录表格，可横向滚动"},h("table",{},h("thead",{},h("tr",{},["标题","状态",...(showDelivery?[view==="content"?"发布状态":"发送状态"]:[]),"负责人","更新日期"].map(t=>h("th",{scope:"col"},t)))),h("tbody",{},rows.map(r=>
    h("tr",{},h("td",{class:"table-title"},h("button",{type:"button",class:"record-link",onclick:()=>openRecord(r.id)},r.title),h("small",{class:"table-sub"},kindName(r.kind),r.details?.channel?" · "+displayValue(r.details.channel):"",evidenceCount(r)?" · "+evidenceCount(r)+" 条证据":"")),
      h("td",{},badge(r.status)),showDelivery?h("td",{},deliveryState(r)):null,h("td",{},owner(r)),h("td",{class:"td-date"},stamp(r.updatedAt)))))));
}
function showSheet(title,content,context){
  if(!sheet.open)focusReturn=document.activeElement;
  dialogContext=context;
  sheet.replaceChildren(h("div",{class:"sheet-inner"},h("div",{class:"sheet-head"},h("h2",{id:"sheet-title",tabindex:"-1"},title),btn("",closeSheet,{class:"icon-btn",icon:"close",aria:"关闭面板"})),h("div",{class:"sheet-body"},content)));
  if(!sheet.open)sheet.showModal();
  sheet.scrollTop=0;document.body.classList.add("sheet-open");document.getElementById("sheet-title").focus({preventScroll:true});
}
function closeSheet(){
  if(dialogBusy)return;
  if(sheet.open)sheet.close();
}
sheet.addEventListener("cancel",e=>{if(dialogBusy)e.preventDefault();});
sheet.addEventListener("click",e=>{const r=sheet.getBoundingClientRect();if(e.target===sheet && (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom))closeSheet();});
sheet.addEventListener("close",()=>{dialogContext=null;document.body.classList.remove("sheet-open");if(focusReturn?.isConnected)focusReturn.focus({preventScroll:true});else document.querySelector("main")?.focus({preventScroll:true});});
function openList(title,rows,emptyTitle="暂无记录",emptyText="新增的记录将在此显示。"){
  showSheet(title,rows.length?h("div",{class:"panel"},rows.map(r=>recordRow(r))):empty(emptyTitle,emptyText),{kind:"list"});
}
function displayValue(v){
  if(v===null||v===undefined||v==="")return "未记录";
  if(typeof v==="boolean")return v?"是":"否";
  if(Array.isArray(v))return v.map(displayValue).join("、");
  if(typeof v==="object")return JSON.stringify(v,null,2);
  return String(v);
}
function safeUrl(raw){
  if(typeof raw!=="string")return null;
  try{const url=new URL(raw);return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function valueNode(key,value){
  if(["reportsTo","reports_to","runId","taskId"].includes(key)&&lookup(value))return btn(lookup(value).title,()=>openRecord(value),{class:"text-btn"});
  if(key==="completionRate" && value==null)return "暂无可计算的比率";
  if(key==="budget" && value==null)return "未登记";
  const url=safeUrl(value);
  if(url)return h("a",{href:url,target:"_blank",rel:"noopener noreferrer"},value);
  return displayValue(value);
}
function defs(entries){return h("dl",{class:"details-grid"},entries.map(([key,value])=>[h("dt",{},key),h("dd",{},value)]));}
function subSection(title,content){return h("section",{class:"bordered-section"},h("h3",{},title),content);}
function evidenceSection(r){
  if(!evidenceCount(r))return subSection("证据与出处",h("p",{class:"form-hint"},"此记录尚未附上证据。"));
  return subSection("证据与出处",h("ol",{class:"source-list"},r.evidence.map(e=>{
    if(typeof e==="string")return h("li",{},valueNode("",e));
    const url=safeUrl(e.url), ref=lookup(e.ref);
    return h("li",{},url?h("a",{href:url,target:"_blank",rel:"noopener noreferrer"},e.label||url):h("strong",{},e.label||"证据"),e.ref?h("small",{},ref?btn(ref.title,()=>openRecord(ref.id),{class:"text-btn"}):"引用 · "+e.ref):null,e.observedAt?h("small",{},"核验时间 · "+stamp(e.observedAt,true)):null);
  })));
}
function historySection(r){
  const events=state.history.filter(e=>e.recordId===r.id).sort((a,b)=>(b.revision||0)-(a.revision||0)||String(b.createdAt).localeCompare(String(a.createdAt)));
  return subSection("记录历史",events.length?h("ol",{class:"history-list"},events.map(e=>h("li",{},h("strong",{},e.fromStatus && e.fromStatus!==e.toStatus?(statusLabels[e.fromStatus]||e.fromStatus)+" → ":"",statusLabels[e.toStatus]||e.toStatus||"已更新"),h("small",{},"版本 "+(e.revision??"—")+" · "+stamp(e.createdAt,true)),e.note?h("p",{class:"read-body"},e.note):null))):h("p",{class:"form-hint"},"暂无可显示的变更记录。"));
}
function agentSections(r){
  const assigned=state.records.filter(x=>x.agentId===r.id), children=records("agent").filter(a=>a.details?.reportsTo===r.id);
  const groups=[["下级工作区",children],["任务与运行",assigned.filter(x=>["task","run","schedule"].includes(x.kind))],["交付记录",assigned.filter(isReview)],["知识、来源与证据",assigned.filter(x=>["knowledge","source","evidence"].includes(x.kind))]];
  return [h("div",{class:"actions"},btn("指派任务",()=>openComposer("task",r.id),{class:"btn primary",icon:"plus"}),btn("添加角色知识",()=>openComposer("knowledge",r.id),{icon:"book"})),...groups.filter(([label,list])=>label!=="下级工作区"||list.length).map(([label,list])=>subSection(label,list.length?h("div",{class:"panel"},recent(list).map(x=>recordRow(x))):h("p",{class:"form-hint"},"此工作区暂无关联记录。")))];
}
function openRecord(id){
  const r=lookup(id);if(!r)return;
  const metadata=[["状态",badge(r.status)],["记录编号",r.id],["版本",String(r.revision??"未记录")],["更新时间",stamp(r.updatedAt,true)+" · 纽约"]];
  if(r.kind!=="agent")metadata.splice(1,0,["负责工作区",lookup(r.agentId)?btn(owner(r),()=>openRecord(r.agentId),{class:"text-btn"}):owner(r)]);
  const details=Object.entries(r.details||{}).map(([k,v])=>[detailLabels[k]||k,valueNode(k,v)]);
  const content=[h("h3",{class:"sheet-title"},r.title),defs(metadata)];
  if(r.kind==="agent"&&!r.details?.model&&!r.details?.resolvedModel)content.push(h("div",{class:"notice"},"此工作区尚未登记已核实的执行模型。"));
  if(isReview(r)){
    if(["draft","needs_review","changes_requested"].includes(r.status))content.push(reviewForm(r));
    else{content.push(subSection("交付正文",r.body?h("div",{class:"read-body"},r.body):h("p",{class:"form-hint"},"暂无正文。")));if(r.status==="approved")content.push(h("div",{class:"notice good"},"审核已批准。发送或发布情况以对应渠道回执为准。"));}
  }else if(r.body)content.push(subSection("记录内容",h("div",{class:"read-body"},r.body)));
  if(details.length)content.push(subSection("详细信息",defs(details)));
  if(r.kind==="agent")content.push(...agentSections(r));
  else content.push(evidenceSection(r));
  content.push(historySection(r));
  showSheet(kindName(r.kind)+(r.kind==="agent"?"工作区":"详情"),content,{kind:"record",id});
}
function field(label,tag,hint){return h("label",{class:"form-field"},h("span",{},label),tag,hint?h("small",{class:"form-hint"},hint):null);}
function formError(box,msg){box.replaceChildren(msg?h("div",{class:"notice error",role:"alert"},msg):"");}
async function writeRecord(path,payload,form,box,onSuccess){
  if(dialogBusy)return;
  dialogBusy=true;formError(box,"");
  const controls=[...form.querySelectorAll("button,input,select,textarea")];controls.forEach(e=>e.disabled=true);
  let saved=false;
  try{
    const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload)});
    if(!response.ok)throw new Error(await apiError(response));
    const result=await response.json();if(!result.record?.id)throw new Error("服务未返回记录编号，请刷新后核对。");
    saved=true;
    const i=state.records.findIndex(r=>r.id===result.record.id);
    if(i<0)state.records.push(result.record);else state.records[i]=result.record;
    try{await readState();}catch(e){error=e.message;}
    dialogBusy=false;render();onSuccess(result.record);
  }catch(e){
    formError(box,saved?"操作已写入，请刷新以确认最新状态。":e.message||"请求未完成，请重试。");
  }finally{dialogBusy=false;controls.forEach(e=>e.disabled=false);}
}
function reviewForm(r){
  const body=h("textarea",{rows:"12",name:"body",required:true},r.body||"");
  const note=h("textarea",{rows:"2",name:"note",maxlength:2000,placeholder:"填写修改要求或审批依据"});
  const box=h("div",{}),form=h("form",{class:"stack",onsubmit:e=>e.preventDefault()});
  async function decide(decision){
    if(!body.value.trim()){body.setCustomValidity("请输入交付正文。");body.reportValidity();return;}
    if(decision==="revise"&&!note.value.trim()){note.setCustomValidity("请填写修改要求。");note.reportValidity();return;}
    const payload={decision,revision:r.revision,note:note.value.trim()};
    if(["save","submit"].includes(decision))payload.body=body.value;
    else if(body.value!==r.body){formError(box,"正文有未保存的修改。请先保存修改，再记录审核决定。");return;}
    await writeRecord("/api/reviews/"+encodeURIComponent(r.id),payload,form,box,record=>{
      openRecord(record.id);notify(({approve:"审核已批准",revise:"已记录修改要求",submit:"已提交审核",save:"已保存修改"})[decision]);});
  }
  body.addEventListener("input",()=>body.setCustomValidity(""));note.addEventListener("input",()=>note.setCustomValidity(""));
  const actions=h("div",{class:"form-actions"},btn("保存修改",()=>decide("save")));
  if(r.status==="needs_review")actions.append(btn("要求修改",()=>decide("revise")),btn("批准",()=>decide("approve"),{class:"btn primary",icon:"check"}));
  else actions.append(btn("提交审核",()=>decide("submit"),{class:"btn primary",icon:"review"}));
  form.append(field("交付正文",body),field("审核意见",note,"要求修改时，请说明需要调整的内容。"),box,actions);
  return subSection("编辑与审核",form);
}
function requestId(){
  if(typeof crypto.randomUUID==="function")return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
}
function openComposer(type,agentId=""){
  const isTask=type==="task", agents=records("agent").filter(a=>!isTask || a.details?.level!=="L0");
  const selected=agents.some(a=>a.id===agentId)?agentId:"";
  const select=h("select",{required:isTask,name:"agentId"},h("option",{value:""},isTask?"选择执行工作区":"共享知识"),agents.map(a=>h("option",{value:a.id},(a.details?.level?a.details.level+" · ":"")+a.title)));select.value=selected;
  const title=h("input",{required:true,name:"title",maxlength:180,placeholder:isTask?"例如，核对本周渠道资料":"输入知识标题"});
  const body=h("textarea",{required:!isTask,name:"body",rows:"7",placeholder:isTask?"说明所需资料、交付格式和完成条件":"记录事实、适用范围与依据"});
  const source=h("input",{type:"url",name:"source",placeholder:"https://…"});
  const form=h("form",{class:"stack"}), box=h("div",{}), req=requestId();
  if(isTask&&!agents.length){showSheet("新建任务",empty("尚无可指派的执行工作区","导入 L1 或 L2 工作区后即可创建任务。"),{kind:"composer"});return;}
  form.append(field("标题",title),field(isTask?"负责工作区":"归属工作区",select),field(isTask?"任务说明":"知识正文",body));
  if(!isTask)form.append(field("来源链接（可选）",source));
  form.append(h("p",{class:"form-hint"},isTask?"任务将进入执行队列。后续运行和交付可在任务与运行中核对。":"知识保存后可按所属工作区或正文搜索。"),box,h("div",{class:"form-actions"},h("button",{type:"submit",class:"btn primary"},icon("plus"),isTask?"加入任务队列":"保存知识"),btn("取消",closeSheet)));
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!title.value.trim()){title.setCustomValidity("请输入标题。");title.reportValidity();return;}
    if(!isTask&&!body.value.trim()){body.setCustomValidity("请输入知识正文。");body.reportValidity();return;}
    const payload={requestId:req,title:title.value.trim(),body:body.value.trim(),...(select.value?{agentId:select.value}:{})};
    if(!isTask&&source.value.trim()){
      if(!safeUrl(source.value.trim())){source.setCustomValidity("请输入有效的 HTTP 或 HTTPS 来源地址。");source.reportValidity();return;}
      payload.evidence=[{label:"参考来源",url:source.value.trim()}];
    }
    await writeRecord(isTask?"/api/tasks":"/api/knowledge",payload,form,box,record=>{openRecord(record.id);notify(isTask?"任务已加入队列":"知识已保存");});
  });
  for(const input of [title,body,source])input.addEventListener("input",()=>input.setCustomValidity(""));
  showSheet(isTask?"新建任务":"添加知识",form,{kind:"composer"});
}
window.addEventListener("hashchange",()=>{
  const target=location.hash.slice(1);if(target==="main-area")return;
  page=currentRoute();menuOpen=false;if(sheet.open)closeSheet();render();window.scrollTo(0,0);document.querySelector("main")?.focus({preventScroll:true});
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&menuOpen){menuOpen=false;render();document.querySelector(".menu-toggle")?.focus();}});
refresh();
