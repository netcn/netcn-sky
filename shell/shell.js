(function(){
var d=document, r=d.documentElement, host=(location.hostname||'').replace(/^www\./,'');
var key=/^ask\./.test(host)?'ask':/^quiz\./.test(host)?'quiz':/^game\./.test(host)?'game':/^sky\./.test(host)?'sky':'nav';
/* 本地预览时按子目录判断（localhost/home|quiz|game），或 ?nc= 强制指定 */
var path=(location.pathname||'').split('/')[1]||'';
if(host==='localhost'||host==='127.0.0.1'){
  if(path==='quiz'||path==='game'||path==='ask'||path==='sky') key=path;
  if(path==='home') key='nav';
}
var force=(location.search.match(/[?&]nc=(nav|ask|quiz|game|sky)/)||[])[1];
if(force) key=force;
/* 各站自有的语言存储键；壳层负责与全域 cookie 对齐 */
var LKEY={game:'arcade_lang'};
var lkey=LKEY[key]||'lang';
function get(n){var m=(d.cookie||'').match('(?:^|; )'+n+'=([^;]*)');return m?decodeURIComponent(m[1]):'';}
function put(n,v){
  var dom=/(^|\.)netcn\.org$/.test(host)?'; Domain=.netcn.org':'';
  d.cookie=n+'='+encodeURIComponent(v)+'; Path=/; Max-Age=31536000; SameSite=Lax'+dom;
}

/* 1) 跨子域状态：cookie 优先，喂给页面各自的读取逻辑 */
var ct=get('ncn_theme'), cl=get('ncn_lang');
if(ct && ct!==localStorage.getItem('theme')) localStorage.setItem('theme',ct);
if(cl && cl!==localStorage.getItem(lkey)) localStorage.setItem(lkey,cl);

/* 2) 当前站：顶栏高亮 + 主题色 */
function paint(){
  [].slice.call(d.querySelectorAll('.nc-shell,.nc-inner,.nc-sw,.nc-foot')).forEach(function(s){s.setAttribute('data-nc',key);});
  [].slice.call(d.querySelectorAll('[data-nc-to]')).forEach(function(a){
    if(a.getAttribute('data-nc-to')===key) a.setAttribute('aria-current','page');
  });
}
if(d.readyState==='loading') d.addEventListener('DOMContentLoaded',paint); else paint();

/* 3) 四站统一工具区：明暗 / 中英由同一段逻辑驱动
      切换方式一致 = 点击即时生效（不刷新）、按钮图标文案即时更新、
      写同一套 localStorage + 全域 cookie、派发同一事件给页面重渲染 */
function sysDark(){try{return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);}catch(e){return false;}}
function curTheme(){return r.getAttribute('data-theme')||localStorage.getItem('theme')||(sysDark()?'dark':'light');}
/* quiz 的题目是中文，界面默认仍用中文；其余站按浏览器语言 */
var DEFLANG={quiz:'zh'};
function curLang(){return localStorage.getItem(lkey)||DEFLANG[key]||(/^zh/.test((navigator.language||'').toLowerCase())?'zh':'en');}

function applyTheme(t, silent){
  if(t!=='dark') t='light';
  r.setAttribute('data-theme',t);
  if(t==='dark') r.classList.add('dark'); else r.classList.remove('dark');
  var b=d.getElementById('ncTheme');
  if(b){ b.textContent=t==='dark'?'☀':'☾'; b.setAttribute('aria-label',t==='dark'?'切换为浅色':'切换为深色'); }
  if(!silent){
    localStorage.setItem('theme',t); put('ncn_theme',t);
    try{ d.dispatchEvent(new CustomEvent('ncn:theme',{detail:{theme:t}})); }catch(e){}
  }
}
function applyLang(l, silent){
  if(l!=='en') l='zh';
  localStorage.setItem(lkey,l);
  if(!silent) put('ncn_lang',l);
  r.setAttribute('lang',l==='en'?'en':'zh-CN');
  var b=d.getElementById('ncLang');
  if(b){ b.textContent=l==='zh'?'EN':'中'; b.setAttribute('aria-label',l==='zh'?'Switch to English':'切换到中文'); }
  if(!silent){
    try{ d.dispatchEvent(new CustomEvent('ncn:lang',{detail:{lang:l}})); }catch(e){}
  }
}

function initTools(){
  applyTheme(curTheme(),true);
  applyLang(curLang(),true);
  d.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('#ncTheme,#ncLang'):null;
    if(!b) return;
    if(b.id==='ncTheme') applyTheme(curTheme()==='dark'?'light':'dark');
    else applyLang(curLang()==='zh'?'en':'zh');
  },true);
}
if(d.readyState==='loading') d.addEventListener('DOMContentLoaded',initTools); else initTools();

/* 4) 兼容页面自有开关（旧按钮 / 游戏页快捷条）：改完后写回全域 cookie */
function mirror(){
  var t=r.getAttribute('data-theme')||localStorage.getItem('theme');
  var l=localStorage.getItem(lkey);
  if(t) put('ncn_theme',t);
  if(l) put('ncn_lang',l);
}
d.addEventListener('click',function(e){
  var b=e.target.closest?e.target.closest('.nc-tools button,.nc-sw button,#themeToggle,#langToggle,.lang-btn,#lang,#theme'):null;
  if(b) setTimeout(mirror,0);
},true);
addEventListener('pageshow',mirror);
})();
