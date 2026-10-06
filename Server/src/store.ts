import crypto from 'node:crypto';
import type { AuditLog, Customer, Plan, Product } from '@friday/shared';
export const ids = ()=>crypto.randomUUID();
export const products:Product[]=[
 {id:'p-crm',name:'Friday AI CRM',description:'AI-enabled sales relationship management.',version:'1.4.0',status:'ACTIVE',modules:['Leads','Pipeline','Contacts'],features:['AI scoring','Reports']},
 {id:'p-desk',name:'Friday AI Desk',description:'Unified service operations platform.',version:'2.1.0',status:'ACTIVE',modules:['Inbox','Knowledge','Analytics'],features:['AI reply','SLA']},
 {id:'p-comms',name:'Friday Communication',description:'Omnichannel communication.',version:'1.1.0',status:'ACTIVE',modules:['Voice','WhatsApp','Email'],features:['Templates','Routing']},
 {id:'p-auto',name:'Friday Automation',description:'Workflow automation platform.',version:'1.0.0',status:'ACTIVE',modules:['Flows','Triggers'],features:['Webhooks','Approvals']}
];
export const plans:Plan[]=['Basic','Premium','Enterprise'].map((name,i)=>({id:`plan-${name.toLowerCase()}`,name,productId:'p-desk',userLimit:[5,30,999][i],storageGb:[10,100,1000][i],apiLimit:[1000,10000,100000][i],entitlements:i===0?['Inbox']:i===1?['Inbox','Knowledge','AI reply','SLA']:['Inbox','Knowledge','AI reply','SLA','Custom integrations']}));
export const customers:Customer[]=[
 {id:'c1',customerId:'FRI-1001',companyName:'Demo Hospitality',legalName:'Demo Hospitality Private Limited',email:'admin@demohospitality.test',phone:'+91 98765 10001',industry:'Hospitality',status:'ACTIVE',accountOwner:'Ananya Rao',createdAt:'2026-09-20T08:30:00Z',city:'Mumbai',country:'India'},
 {id:'c2',customerId:'FRI-1002',companyName:'Demo Real Estate',legalName:'Demo Realty LLP',email:'admin@demorealty.test',industry:'Real Estate',status:'TRIAL',accountOwner:'Vikram Shah',createdAt:'2026-09-27T10:00:00Z',city:'Bengaluru',country:'India'},
 {id:'c3',customerId:'FRI-1003',companyName:'Demo Fitness',legalName:'Demo Fitness India Pvt Ltd',email:'admin@demofitness.test',industry:'Fitness',status:'ONBOARDING',accountOwner:'Ananya Rao',createdAt:'2026-10-02T12:10:00Z',city:'Pune',country:'India'},
 {id:'c4',customerId:'FRI-1004',companyName:'Demo Sales',legalName:'Demo Sales Technologies',email:'admin@demosales.test',industry:'Sales',status:'ACTIVE',accountOwner:'Vikram Shah',createdAt:'2026-10-04T09:15:00Z',city:'Delhi',country:'India'}
];
export const audit:AuditLog[]=[{id:'a1',actor:'Ananya Rao',action:'customer.created',resourceType:'customer',resourceId:'c3',timestamp:'2026-10-02T12:10:00Z'},{id:'a2',actor:'System',action:'subscription.activated',resourceType:'subscription',resourceId:'s1',timestamp:'2026-10-04T09:15:00Z'}];
export const addAudit=(action:string,resourceType:string,resourceId:string,before?:unknown,after?:unknown)=>audit.unshift({id:ids(),actor:'Demo Super Admin',action,resourceType,resourceId,before,after,timestamp:new Date().toISOString()});
