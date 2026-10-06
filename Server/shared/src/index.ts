export type Lifecycle = 'PROSPECT'|'ONBOARDING'|'KYC'|'TRIAL'|'ACTIVE'|'UPGRADE'|'DOWNGRADE'|'RENEWAL'|'SUSPENDED'|'CANCELLED'|'ARCHIVED';
export type Permission = 'customer.view'|'customer.create'|'customer.update'|'customer.delete'|'product.view'|'product.manage'|'subscription.view'|'subscription.manage'|'infrastructure.view'|'infrastructure.manage'|'deployment.view'|'deployment.manage'|'configuration.view'|'configuration.manage'|'audit.view';
export interface Customer { id:string; customerId:string; companyName:string; legalName:string; email:string; phone?:string; industry:string; status:Lifecycle; accountOwner:string; createdAt:string; city?:string; country?:string; }
export interface Product { id:string; name:string; description:string; version:string; status:string; modules:string[]; features:string[] }
export interface Plan { id:string; name:string; productId:string; userLimit:number; storageGb:number; apiLimit:number; entitlements:string[] }
export interface AuditLog { id:string; actor:string; action:string; resourceType:string; resourceId:string; before?:unknown; after?:unknown; timestamp:string }
