import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@friday/shared';

const all: Permission[] = [
  'customer.view',
  'customer.create',
  'customer.update',
  'customer.delete',
  'product.view',
  'product.manage',
  'subscription.view',
  'subscription.manage',
  'infrastructure.view',
  'infrastructure.manage',
  'deployment.view',
  'deployment.manage',
  'configuration.view',
  'configuration.manage',
  'audit.view',
];

const roles: Record<string, Permission[]> = {
  'Super Admin': all,

  Admin: all,

  Operations: [
    'customer.view',
    'customer.create',
    'customer.update',
    'product.view',
    'subscription.view',
    'subscription.manage',
    'configuration.view',
    'configuration.manage',
    'audit.view',
  ],

  Support: [
    'customer.view',
    'product.view',
    'configuration.view',
  ],

  Finance: [
    'customer.view',
    'subscription.view',
    'subscription.manage',
    'audit.view',
  ],

  'Infrastructure Admin': [
    'infrastructure.view',
    'infrastructure.manage',
    'deployment.view',
    'deployment.manage',
    'audit.view',
  ],

  Viewer: [
    'customer.view',
    'product.view',
    'subscription.view',
    'infrastructure.view',
    'deployment.view',
    'configuration.view',
    'audit.view',
  ],
};

declare global {
  namespace Express {
    interface Request {
      actor?: {
        id: string;
        role: string;
        permissions: Permission[];
        customerId?: string;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');

  // Production authentication through Supabase.
  if (
    token &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY
  ) {
    const verify = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${token}`,
        },
      },
    );

    if (!verify.ok) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Invalid Supabase session',
      });
    }

    const user: any = await verify.json();

    const role = String(
      user.app_metadata?.master_role || 'Viewer',
    );

    req.actor = {
      id: user.id,
      role,
      permissions: roles[role] || [],
      customerId: user.app_metadata?.customer_id,
    };

    return next();
  }

  // Demo authentication is allowed only when FRIDAY_ENV is not PROD.
  // This allows Vercel NODE_ENV=production to host the DEV beta environment.
  if (process.env.FRIDAY_ENV !== 'PROD') {
    const role = String(
      req.header('x-demo-role') || 'Super Admin',
    );

    req.actor = {
      id: 'demo-user',
      role,
      permissions: roles[role] || [],
    };

    return next();
  }

  return res.status(401).json({
    error: 'UNAUTHENTICATED',
    message: 'Supabase session required',
  });
}

export const authorize =
  (permission: Permission) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (req.actor?.permissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      error: 'FORBIDDEN',
      message: `Permission required: ${permission}`,
    });
  };