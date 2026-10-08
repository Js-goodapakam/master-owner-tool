import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
} from 'lucide-react';

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}) => (
  <button
    className={`btn btn-${variant} btn-${size}`}
    {...props}
  >
    {icon}
    <span>{children}</span>
  </button>
);

export const Card = ({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={`card ${className}`}>
    {(title || subtitle || action) && (
      <div className="card-header">
        <div>
          {title && <h3>{title}</h3>}
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>

        {action && <div className="card-action">{action}</div>}
      </div>
    )}

    <div className="card-body">{children}</div>
  </section>
);

export const Badge = ({
  children,
  variant = 'info',
}: {
  children: ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
}) => (
  <span className={`badge badge-${variant}`}>
    {children}
  </span>
);

export const Input = (
  props: InputHTMLAttributes<HTMLInputElement>
) => <input className="input" {...props} />;

export const Select = ({
  children,
  ...props
}: any) => (
  <div className="select-wrap">
    <select className="input select" {...props}>
      {children}
    </select>

    <ChevronDown size={16} aria-hidden="true" />
  </div>
);

export const Loading = () => (
  <div className="state state-loading">
    <LoaderCircle className="spin" size={22} />
    <span>Loading control-plane data...</span>
  </div>
);

export const Empty = () => (
  <div className="state state-empty">
    <CheckCircle2 size={22} />
    <span>Nothing to show yet.</span>
  </div>
);

export const ErrorState = ({
  message,
}: {
  message: string;
}) => (
  <div className="state state-error">
    <AlertCircle size={22} />
    <span>{message}</span>
  </div>
);

export const Table = ({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) => (
  <div className="table-wrap">
    <table>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>

      <tbody>{children}</tbody>
    </table>
  </div>
);