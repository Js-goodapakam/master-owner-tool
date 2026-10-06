import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
export const Button=({children,...p}:ButtonHTMLAttributes<HTMLButtonElement>)=><button className="btn" {...p}>{children}</button>;
export const Card=({title,children}:{title?:string;children:ReactNode})=><section className="card">{title&&<h3>{title}</h3>}{children}</section>;
export const Badge=({children}:{children:ReactNode})=><span className="badge">{children}</span>;
export const Input=(p:InputHTMLAttributes<HTMLInputElement>)=><input className="input" {...p}/>;
export const Select=({children,...p}:any)=><select className="input" {...p}>{children}</select>;
export const Loading=()=> <div className="state">Loading control-plane data…</div>; export const Empty=()=> <div className="state">Nothing to show yet.</div>; export const ErrorState=({message}:{message:string})=><div className="error">{message}</div>;
export const Table=({headers,children}:{headers:string[];children:ReactNode})=><div className="table-wrap"><table><thead><tr>{headers.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
