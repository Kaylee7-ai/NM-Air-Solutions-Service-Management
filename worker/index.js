const ALLOWED_ORIGIN = "https://kaylee7-ai.github.io";
const HEADERS = {
 "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
 "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
 "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Setup-Key",
 "Access-Control-Max-Age": "86400",
 "Vary": "Origin"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {
 status, headers: {...HEADERS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const error = (message,status=400) => json({error:message},status);
const clean = (v,max=500) => String(v ?? "").trim().slice(0,max);
const uuid = () => crypto.randomUUID();
const hex = (bytes=32) => { const a=new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(v=>v.toString(16).padStart(2,"0")).join(""); };
const sha = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,"0")).join("");
const secureEqual = async (left,right) => {
 const [a,b]=await Promise.all([sha(String(left ?? "")),sha(String(right ?? ""))]);
 const aa=Uint8Array.from(a.match(/../g),x=>parseInt(x,16)),bb=Uint8Array.from(b.match(/../g),x=>parseInt(x,16));
 return crypto.subtle.timingSafeEqual(aa,bb);
};
const emailOK = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
async function readBody(request) {
 const length=Number(request.headers.get("content-length")||0);
 if(length>20000) throw new Error("Request too large.");
 const value=await request.json();
 if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("Invalid request body.");
 return value;
}
async function passwordHash(password,salt=hex(16)) {
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
 const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:Uint8Array.from(salt.match(/../g),x=>parseInt(x,16)),iterations:210000,hash:"SHA-256"},key,256);
 return "pbkdf2$210000$"+salt+"$"+[...new Uint8Array(bits)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
async function passwordVerify(password,stored) {
 const parts=String(stored||"").split("$");
 if(parts.length!==4 || parts[0]!=="pbkdf2" || parts[1]!=="210000") return false;
 const calculated=(await passwordHash(password,parts[2])).split("$")[3];
 return secureEqual(calculated,parts[3]);
}
async function auth(request,env) {
 const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token) return null;
 const row=await env.DB.prepare("SELECT u.id,u.email,u.full_name,u.phone,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND julianday(s.expires_at)>julianday('now') AND u.active=1").bind(await sha(token)).first();
 return row || null;
}
async function log(env,requestId,userId,action,note="") {
 await env.DB.prepare("INSERT INTO activity_log(id,request_id,actor_user_id,action,note) VALUES(?,?,?,?,?)").bind(uuid(),requestId,userId,action,clean(note,1000)).run();
}
const roles = ["owner","manager","technician"];
const statuses = ["New","Assigned","In progress","Awaiting parts","Completed","Cancelled"];
async function setupStatus(env) {
 const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
 return {setup_required:Number(row?.n||0)===0};
}
export default {
 async fetch(request,env) {
  const url=new URL(request.url),path=url.pathname;
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:HEADERS});
  const origin=request.headers.get("Origin");
  if(origin && origin!==ALLOWED_ORIGIN) return error("Origin not allowed.",403);
  try {
   if(path==="/health" && request.method==="GET") {
    const check=await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ok:check?.ok===1,service:"NM Air Solutions Service API",database:"connected"});
   }
   if(path==="/api/setup-status" && request.method==="GET") return json(await setupStatus(env));
   if(path==="/api/setup" && request.method==="POST") {
    if(!env.SETUP_KEY || env.SETUP_KEY.length<32 || !await secureEqual(request.headers.get("X-Setup-Key"),env.SETUP_KEY)) return error("Setup code is incorrect.",403);
    const state=await setupStatus(env);
    if(!state.setup_required) return error("Initial owner setup has already been completed.",409);
    const d=await readBody(request),name=clean(d.full_name,100),email=clean(d.email,160).toLowerCase(),password=String(d.password||"");
    if(name.length<2 || !emailOK(email) || password.length<12) return error("Enter a valid name and email. Password must contain at least 12 characters.");
    const created=await env.DB.prepare("INSERT INTO users(id,email,full_name,phone,password_hash,role) SELECT ?,?,?,?,?, 'owner' WHERE NOT EXISTS (SELECT 1 FROM users)").bind(uuid(),email,name,clean(d.phone,30),await passwordHash(password)).run();
    if(!created.meta?.changes) return error("Initial owner setup has already been completed.",409);
    return json({ok:true,message:"Owner account created. You can now sign in."},201);
   }
   if(path==="/api/login" && request.method==="POST") {
    const d=await readBody(request),email=clean(d.email,160).toLowerCase(),password=String(d.password||"");
    if(!emailOK(email)||password.length>256) return error("Email or password is incorrect.",401);
    const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE email=? AND attempted_at>datetime('now','-15 minutes') AND successful=0").bind(email).first();
    if(Number(recent?.n||0)>=8) return error("Too many sign-in attempts. Please wait 15 minutes and try again.",429);
    const user=await env.DB.prepare("SELECT * FROM users WHERE email=? AND active=1").bind(email).first();
    const valid=!!user && await passwordVerify(password,user.password_hash);
    await env.DB.prepare("INSERT INTO login_attempts(id,email,successful) VALUES(?,?,?)").bind(uuid(),email,valid?1:0).run();
    if(!valid) return error("Email or password is incorrect.",401);
    const token=hex(32),expires=new Date(Date.now()+12*60*60*1000).toISOString();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(token),user.id,expires).run();
    return json({token,expires_at:expires,user:{id:user.id,email:user.email,full_name:user.full_name,phone:user.phone,role:user.role}});
   }
   if(path==="/api/requests" && request.method==="POST") {
    const d=await readBody(request),name=clean(d.name,100),phone=clean(d.phone,30),service=clean(d.service,100),location=clean(d.location,180);
    const date=clean(d.date,10),unit=clean(d.unit,80),details=clean(d.details,2000);
    if(name.length<2||phone.length<7||!service||location.length<3) return error("Please provide your name, phone number, service and location.");
    if(date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error("Please enter a valid preferred date.");
    const id="NM-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+hex(8).toUpperCase();
    await env.DB.prepare("INSERT INTO service_requests(id,customer_name,customer_phone,service_type,location,preferred_date,ac_type,details) VALUES(?,?,?,?,?,?,?,?)").bind(id,name,phone,service,location,date||null,unit||null,details).run();
    await log(env,id,null,"Request submitted","Customer submitted a service request.");
    return json({ok:true,reference:id,status:"New"},201);
   }
   if(path==="/api/track" && request.method==="GET") {
    const id=clean(url.searchParams.get("reference"),60).toUpperCase();
    if(!id) return error("Enter your job reference.");
    const row=await env.DB.prepare("SELECT id,service_type,status,preferred_date,created_at,updated_at FROM service_requests WHERE id=?").bind(id).first();
    return row?json({request:row}):error("No request was found for that reference.",404);
   }
   const user=await auth(request,env);
   if(path==="/api/logout" && request.method==="POST") {
    const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(token)).run();
    return json({ok:true});
   }
   if(!user) return error("Please sign in to continue.",401);
   if(path==="/api/me" && request.method==="GET") return json({user});
   if(path==="/api/requests" && request.method==="GET") {
    let sql="SELECT r.*,u.full_name AS technician_name FROM service_requests r LEFT JOIN users u ON u.id=r.assigned_to",params=[];
    if(user.role==="technician") {sql+=" WHERE r.assigned_to=?";params.push(user.id);}
    sql+=" ORDER BY r.created_at DESC LIMIT 300";
    const rows=await env.DB.prepare(sql).bind(...params).all();
    return json({requests:rows.results||[]});
   }
   const requestMatch=path.match(/^\/api\/requests\/([A-Za-z0-9-]+)$/);
   if(requestMatch && request.method==="PATCH") {
    const id=requestMatch[1],d=await readBody(request),old=await env.DB.prepare("SELECT * FROM service_requests WHERE id=?").bind(id).first();
    if(!old) return error("Request not found.",404);
    if(user.role==="technician" && old.assigned_to!==user.id) return error("You can only update jobs assigned to you.",403);
    const nextStatus=d.status===undefined?old.status:clean(d.status,30);
    const assigned=d.assigned_to===undefined?old.assigned_to:clean(d.assigned_to,60);
    if(!statuses.includes(nextStatus)) return error("Invalid job status.");
    if(d.assigned_to!==undefined && !["owner","manager"].includes(user.role)) return error("Only an owner or manager can assign jobs.",403);
    if(assigned) {
     const staff=await env.DB.prepare("SELECT id,role,active FROM users WHERE id=?").bind(assigned).first();
     if(!staff||staff.role!=="technician"||!staff.active) return error("Select an active technician account.");
    }
    await env.DB.prepare("UPDATE service_requests SET status=?,assigned_to=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(nextStatus,assigned||null,id).run();
    if(nextStatus!==old.status) await log(env,id,user.id,"Status changed",nextStatus);
    if(assigned!==old.assigned_to) await log(env,id,user.id,"Technician assignment changed",assigned||"Unassigned");
    return json({ok:true,id,status:nextStatus,assigned_to:assigned||null});
   }
   if(path==="/api/staff" && request.method==="GET") {
    if(!["owner","manager"].includes(user.role)) return error("You do not have permission to view staff.",403);
    const rows=await env.DB.prepare("SELECT id,email,full_name,phone,role,active,created_at FROM users ORDER BY full_name").all();
    return json({staff:rows.results||[]});
   }
   if(path==="/api/staff" && request.method==="POST") {
    if(user.role!=="owner") return error("Only the owner can add staff accounts.",403);
    const d=await readBody(request),name=clean(d.full_name,100),email=clean(d.email,160).toLowerCase(),password=String(d.password||""),role=clean(d.role,20);
    if(!["manager","technician"].includes(role)||name.length<2||!emailOK(email)||password.length<12) return error("Enter a valid name, email, role and password of at least 12 characters.");
    try {
     await env.DB.prepare("INSERT INTO users(id,email,full_name,phone,password_hash,role) VALUES(?,?,?,?,?,?)").bind(uuid(),email,name,clean(d.phone,30),await passwordHash(password),role).run();
    } catch(e) { return error("Could not create staff account. That email may already be registered.",409); }
    return json({ok:true},201);
   }
   const staffMatch=path.match(/^\/api\/staff\/([A-Za-z0-9-]+)$/);
   if(staffMatch && request.method==="PATCH") {
    if(user.role!=="owner") return error("Only the owner can change staff access.",403);
    const d=await readBody(request),target=staffMatch[1];
    if(target===user.id) return error("You cannot deactivate your own owner account.",400);
    const active=d.active===false?0:1;
    const result=await env.DB.prepare("UPDATE users SET active=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND role!='owner'").bind(active,target).run();
    if(!result.meta?.changes) return error("Staff account not found.",404);
    if(!active) await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target).run();
    return json({ok:true});
   }
   if(path==="/api/quotes" && request.method==="GET") {
    if(user.role==="technician") return error("You do not have permission to view quotations.",403);
    const rows=await env.DB.prepare("SELECT q.*,r.customer_name,r.id AS job_reference FROM quotes q JOIN service_requests r ON r.id=q.request_id ORDER BY q.created_at DESC LIMIT 200").all();
    return json({quotes:rows.results||[]});
   }
   if(path==="/api/quotes" && request.method==="POST") {
    if(user.role==="technician") return error("You do not have permission to create quotations.",403);
    const d=await readBody(request),requestId=clean(d.request_id,60),amount=Number(d.amount);
    if(!Number.isFinite(amount)||amount<0||amount>100000000) return error("Enter a valid quotation amount.");
    const job=await env.DB.prepare("SELECT id FROM service_requests WHERE id=?").bind(requestId).first();
    if(!job) return error("Service request not found.",404);
    const id="QT-"+hex(4).toUpperCase();
    await env.DB.prepare("INSERT INTO quotes(id,request_id,amount_minor,currency,description,status,created_by) VALUES(?,?,?,'GHS',?,'Draft',?)").bind(id,requestId,Math.round(amount*100),clean(d.description,1000),user.id).run();
    await log(env,requestId,user.id,"Quotation created",id);
    return json({ok:true,id},201);
   }
   if(path==="/api/invoices" && request.method==="GET") {
    if(user.role==="technician") return error("You do not have permission to view invoices.",403);
    const rows=await env.DB.prepare("SELECT i.*,r.customer_name,r.id AS job_reference FROM invoices i JOIN service_requests r ON r.id=i.request_id ORDER BY i.created_at DESC LIMIT 200").all();
    return json({invoices:rows.results||[]});
   }
   if(path==="/api/invoices" && request.method==="POST") {
    if(user.role==="technician") return error("You do not have permission to create invoices.",403);
    const d=await readBody(request),requestId=clean(d.request_id,60),amount=Number(d.amount);
    if(!Number.isFinite(amount)||amount<0||amount>100000000) return error("Enter a valid invoice amount.");
    const job=await env.DB.prepare("SELECT id FROM service_requests WHERE id=?").bind(requestId).first();
    if(!job) return error("Service request not found.",404);
    const id="INV-"+hex(4).toUpperCase();
    await env.DB.prepare("INSERT INTO invoices(id,request_id,amount_minor,currency,status,due_date,created_by) VALUES(?,?,?,'GHS','Unpaid',?,?)").bind(id,requestId,Math.round(amount*100),clean(d.due_date,10)||null,user.id).run();
    await log(env,requestId,user.id,"Invoice created",id);
    return json({ok:true,id},201);
   }
   if(path==="/api/invoices/" && request.method==="PATCH") return error("Invalid invoice reference.");
   const invoiceMatch=path.match(/^\/api\/invoices\/([A-Za-z0-9-]+)$/);
   if(invoiceMatch && request.method==="PATCH") {
    if(user.role==="technician") return error("Permission denied.",403);
    const d=await readBody(request),status=clean(d.status,30);
    if(!["Unpaid","Partially paid","Paid","Void"].includes(status)) return error("Invalid invoice status.");
    const result=await env.DB.prepare("UPDATE invoices SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(status,invoiceMatch[1]).run();
    if(!result.meta?.changes) return error("Invoice not found.",404);
    return json({ok:true});
   }
   if(path==="/api/activity" && request.method==="GET") {
    if(user.role==="technician") return error("Permission denied.",403);
    const rows=await env.DB.prepare("SELECT a.*,u.full_name AS actor_name FROM activity_log a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 250").all();
    return json({activity:rows.results||[]});
   }
   return error("Route not found.",404);
  } catch(e) {
   console.error(JSON.stringify({message:e instanceof Error?e.message:"Unhandled error",path,method:request.method}));
   return error("The service could not complete this request. Please try again.",500);
  }
 }
};