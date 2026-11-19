// Test-only PostgreSQL-backed subset of the Supabase REST boundary.
// This is NOT PostgREST, Supabase Auth, Storage, or RLS. It proves real
// Express route persistence using parameterized SQL against the CI database.
export function createPgRestCompatibility(pool, actors, outside, managedWorkspace = () => new Response(JSON.stringify({status:'synthetic_external_ack'}),{status:200,headers:{'content-type':'application/json'}})) {
  const allowed=new Set([
    'owner_profiles','owner_role_permissions','owner_product_access','products',
    'product_modules','product_features','customers','customer_products',
    'subscriptions','plans','audit_logs','onboarding_sessions','signup_requests',
    'entitlement_overrides','provisioning_jobs'
  ]);
  const ident=s=>{if(!/^[a-z_]+$/.test(s))throw Error('Invalid compatibility identifier');return '"'+s+'"';};
  const response=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
  return async function route(input,init={}) {
    const url=new URL(String(input));
    if(url.hostname==='127.0.0.1')return outside(input,init);
    if(url.hostname==='managed-workspace.invalid')return managedWorkspace(url,init);
    if(url.hostname!=='owner-pg-compat.invalid')throw Error('Unknown external network destination: '+url.hostname);
    if(url.pathname==='/auth/v1/user') {
      const token=String(init?.headers?.authorization||'').replace(/^Bearer\s+/i,'');
      const actor=actors.get(token);
      return actor?response({id:actor,email:'synthetic-test@example.test'}):response({error:'UNAUTHENTICATED'},401);
    }
    if(!url.pathname.startsWith('/rest/v1/'))return response({error:'NOT_EMULATED'},501);
    const table=url.pathname.slice('/rest/v1/'.length);
    if(!allowed.has(table))return response({error:'NOT_EMULATED'},501);
    const method=init.method||'GET', values=[], filters=[];
    try {
      for(const [field,term] of url.searchParams){
        if(['select','order','limit','offset','or'].includes(field))continue;
        const col=ident(field);
        if(term.startsWith('eq.')){
          values.push(term.slice(3));filters.push(col+'=$'+values.length);
        }else if(term.startsWith('in.(')&&term.endsWith(')')){
          values.push(term.slice(4,-1).split(','));filters.push(col+'=ANY($'+values.length+'::text[])');
        }else if(term.startsWith('lte.')){
          values.push(term.slice(4));filters.push(col+'<=$'+values.length);
        }else throw Error('Unsupported compatibility query');
      }
      const where=filters.length?' WHERE '+filters.join(' AND '):'';
      let rows=[];
      if(method==='GET'){
        const order=url.searchParams.get('order');
        let sorting='';
        if(order){const [column,direction]=order.split('.');sorting=' ORDER BY '+ident(column)+(direction==='desc'?' DESC':' ASC');}
        const limit=url.searchParams.get('limit');
        const limitSql=limit&&/^[0-9]+$/.test(limit)?' LIMIT '+Number(limit):'';
        rows=(await pool.query('SELECT * FROM '+ident(table)+where+sorting+limitSql,values)).rows;
        if(table==='owner_product_access'&&(url.searchParams.get('select')||'').includes('products(')){
          rows=await Promise.all(rows.map(async row=>({
            ...row,products:(await pool.query('SELECT product_code FROM products WHERE id=$1',[row.product_id])).rows[0]
          })));
        }
      }else if(method==='POST'){
        const data=JSON.parse(String(init.body||'{}'));
        const keys=Object.keys(data);
        rows=(await pool.query('INSERT INTO '+ident(table)+' ('+keys.map(ident).join(',')+') VALUES ('+
          keys.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',Object.values(data))).rows;
      }else if(method==='PATCH'){
        const data=JSON.parse(String(init.body||'{}')),keys=Object.keys(data);
        const pref=keys.length;
        const patched=filters.map(term=>term.replace(/\$(\d+)/g,(_,number)=>'$'+(Number(number)+pref)));
        rows=(await pool.query('UPDATE '+ident(table)+' SET '+keys.map((key,i)=>ident(key)+'=$'+(i+1)).join(',')+
          (patched.length?' WHERE '+patched.join(' AND '):'')+' RETURNING *',
          [...Object.values(data),...values])).rows;
      }else return response({error:'METHOD_NOT_SUPPORTED'},501);
      const minimal=String(init.headers?.Prefer||'').includes('return=minimal');
      return response(minimal?[]:rows,method==='POST'?201:200);
    }catch(error){
      if(['23503','23505','23514'].includes(error.code))return response({code:error.code},409);
      console.error('SQL REST compatibility boundary:',table,method,error.message);
      return response({error:'SQL_TEST_BOUNDARY_FAILED'},500);
    }
  };
}
