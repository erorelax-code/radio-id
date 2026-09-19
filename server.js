const http=require('http'),https=require('https'),fs=require('fs'),path=require('path');
const root=__dirname, port=process.env.PORT||8080;
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const STREAMS={
  sami:'https://s2.radio.co/s0dc6b5c9b/listen',
  fix:'https://listen-fixradio.sharp-stream.com/fixradio.mp3',
  prl:'https://stream.rcs.revma.com/prfmwmwy768uv'
};
function json(res,code,obj){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))}
function proxyStream(req,res,url,depth=0){
  if(depth>4)return json(res,502,{error:'too_many_redirects'});
  const lib=url.startsWith('https:')?https:http;
  const up=lib.get(url,{headers:{'User-Agent':'RadioID/9.0','Icy-MetaData':'1','Accept':'audio/aac,audio/mpeg,audio/*;q=0.9,*/*;q=0.1'}},r=>{
    if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){r.resume();return proxyStream(req,res,new URL(r.headers.location,url).toString(),depth+1)}
    if(r.statusCode<200||r.statusCode>=300){r.resume();return json(res,502,{error:'upstream_'+r.statusCode})}
    const h={'content-type':r.headers['content-type']||'audio/mpeg','cache-control':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff'};
    for(const k of ['icy-br','icy-genre','icy-name','icy-url','icy-metaint']) if(r.headers[k])h[k]=r.headers[k];
    res.writeHead(200,h); r.pipe(res); req.on('close',()=>r.destroy());
  });
  up.setTimeout(15000,()=>up.destroy(new Error('timeout')));
  up.on('error',()=>{if(!res.headersSent)json(res,502,{error:'stream_unavailable'});else res.destroy()});
}
function serve(req,res,p){let f=path.join(root,p==='/'?'index.html':p);if(!f.startsWith(root))return res.writeHead(403).end();fs.stat(f,(e,st)=>{if(e||!st.isFile()){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-cache'});fs.createReadStream(f).pipe(res)});}
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health')return json(res,200,{ok:true,app:'Radio ID v9'});
  const m=u.pathname.match(/^\/api\/stream\/(sami|fix|prl)$/); if(m)return proxyStream(req,res,STREAMS[m[1]]);
  if(u.pathname==='/api/recognize'&&req.method==='POST')return json(res,501,{error:'recognition_provider_not_configured',message:'Skonfiguruj dostawcę rozpoznawania po stronie serwera.'});
  serve(req,res,u.pathname);
}).listen(port,'0.0.0.0',()=>console.log(`Radio ID mobile: http://0.0.0.0:${port}`));
