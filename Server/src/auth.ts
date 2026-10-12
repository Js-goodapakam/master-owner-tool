import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Permission } from '@friday/shared';

const roleDisplayNames: Record<string, string> = {
  owner: 'Owner',
  super_admin: 'Super Admin',
  admin: 'Admin',
  operations: 'Operations',
  support: 'Support',
  finance: 'Finance',
  infrastructure_admin: 'Infrastructure Admin',
  viewer: 'Viewer',
};

// Demo-only permissions for non-production environments.
const demoPermissions: Record<string, Permission[]> = {
  'Super Admin': [
    'customer.view', 'customer.create', 'customer.update', 'customer.delete',
    'product.view', 'product.manage',
    'subscription.view', 'subscription.manage',
    'infrastructure.view', 'infrastructure.manage',
    'deployment.view', 'deployment.manage',
    'configuration.view', 'configuration.manage', 'audit.view',
  ],
  Owner: [
    'customer.view', 'customer.create', 'customer.update', 'customer.delete',
    'product.view', 'product.manage',
    'subscription.view', 'subscription.manage',
    'infrastructure.view', 'infrastructure.manage',
    'deployment.view', 'deployment.manage',
    'configuration.view', 'configuration.manage', 'audit.view',
  ],
  Admin: [
    'customer.view', 'customer.create', 'customer.update', 'customer.delete',
    'product.view', 'product.manage',
    'subscription.view', 'subscription.manage',
    'infrastructure.view', 'infrastructure.manage',
    'deployment.view', 'deployment.manage',
    'configuration.view', 'configuration.manage', 'audit.view',
  ],
  Operations: [
    'customer.view', 'customer.create', 'customer.update',
    'product.view', 'subscription.view', 'subscription.manage',
    'configuration.view', 'configuration.manage', 'audit.view',
  ],
  Support: ['customer.view', 'product.view', 'configuration.view'],
  Finance: [
    'customer.view', 'subscription.view', 'subscription.manage', 'audit.view',
  ],
  'Infrastructure Admin': [
    'infrastructure.view', 'infrastructure.manage',
    'deployment.view', 'deployment.manage', 'audit.view',
  ],
  Viewer: [
    'customer.view', 'product.view', 'subscription.view',
    'infrastructure.view', 'deployment.view', 'configuration.view', 'audit.view',
  ],
};

type SupabaseUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type OwnerProfile = {
  user_id: string;
  email: string;
  full_name: string;
  role_key: string;
  must_change_password: boolean;
  is_primary_owner: boolean;
  is_active: boolean;
};

function supabaseServiceKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function supabaseRest(
  path: string,
  init: RequestInit = {},
): Promise<globalThis.Response> {
  const base = process.env.SUPABASE_URL;
  const key = supabaseServiceKey();

  if (!base || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.',
    );
  }

  return fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function loadProfile(
  userId: string,
): Promise<OwnerProfile | null> {
  const response = await supabaseRest(
    `owner_profiles?select=user_id,email,full_name,role_key,must_change_password,is_primary_owner,is_active&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );

  if (!response.ok) {
    throw new Error(
      `Could not load Friday Owner profile (${response.status}).`,
    );
  }

  const rows = (await response.json()) as OwnerProfile[];
  return rows[0] ?? null;
}

async function loadPermissions(
  roleKey: string,
): Promise<Permission[]> {
  const response = await supabaseRest(
    `owner_role_permissions?select=permission_key&role_key=eq.${encodeURIComponent(roleKey)}`,
  );

  if (!response.ok) {
    throw new Error(
      `Could not load role permissions (${response.status}).`,
    );
  }

  const rows = (await response.json()) as Array<{
    permission_key: string;
  }>;

  return rows.map((row) => row.permission_key as Permission);
}

/**
 * Creates a primary-owner profile only for the explicitly configured
 * Supabase-authenticated email. Configure FRIDAY_PRIMARY_OWNER_EMAIL
 * on the backend only. Never accept this value from the client.
 */
async function bootstrapPrimaryOwner(
  user: SupabaseUser,
): Promise<OwnerProfile | null> {
  const configuredEmail = process.env.FRIDAY_PRIMARY_OWNER_EMAIL
    ?.trim()
    .toLowerCase();

  const userEmail = user.email?.trim().toLowerCase();

  if (!configuredEmail || !userEmail || userEmail !== configuredEmail) {
    return null;
  }

  const profile = {
    user_id: user.id,
    email: userEmail,
    full_name: String(
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      'Primary Owner',
    ),
    role_key: 'owner',
    account_type: 'internal_employee',
    must_change_password: false,
    is_primary_owner: true,
    is_active: true,
  };

  const response = await supabaseRest(
    'owner_profiles?on_conflict=user_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(profile),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not bootstrap configured primary owner (${response.status}).`,
    );
  }

  // If a profile already existed, loadProfile returns that existing
  // profile; this function does not overwrite its role or owner flag.
  return loadProfile(user.id);
}

declare global {
  namespace Express {
    interface Request {
      actor?: {
        id: string;
        role: string;
        roleKey?: string;
        permissions: Permission[];
        customerId?: string;
        mustChangePassword?: boolean;
        isPrimaryOwner?: boolean;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
) {
  try {
    const token = req
      .header('authorization')
      ?.replace(/^Bearer\s+/i, '');

    if (
      token &&
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_ANON_KEY
    ) {
      const verify = await fetch(
        `${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`,
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
          message: 'Invalid Supabase session.',
        });
      }

      const user = (await verify.json()) as SupabaseUser;

      let profile = await loadProfile(user.id);

      if (!profile) {
        profile = await bootstrapPrimaryOwner(user);
      }

      if (!profile) {
        return res.status(403).json({
          error: 'OWNER_PROFILE_REQUIRED',
          message:
            'This account has not been provisioned for Friday Owner. Ask the primary Owner to create or authorize the account.',
        });
      }

      if (!profile.is_active) {
        return res.status(403).json({
          error: 'ACCOUNT_DISABLED',
          message: 'This Friday Owner account is disabled.',
        });
      }

      const permissions = await loadPermissions(profile.role_key);

      req.actor = {
        id: user.id,
        role: roleDisplayNames[profile.role_key] || profile.role_key,
        roleKey: profile.role_key,
        permissions,
        customerId:
          typeof user.app_metadata?.customer_id === 'string'
            ? user.app_metadata.customer_id
            : undefined,
        mustChangePassword: profile.must_change_password,
        isPrimaryOwner: profile.is_primary_owner,
      };

      return next();
    }

    // Demo authentication is available only outside production.
    if (process.env.FRIDAY_ENV !== 'PROD') {
      const role = String(req.header('x-demo-role') || 'Super Admin');

      req.actor = {
        id: 'demo-user',
        role,
        permissions: demoPermissions[role] || [],
      };

      return next();
    }

    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Supabase session required.',
    });
  } catch (error) {
    console.error('Friday Owner authentication failed:', error);

    return res.status(503).json({
      error: 'AUTH_CONFIGURATION_ERROR',
      message:
        'Friday Owner authentication could not be completed. Check backend Supabase configuration.',
    });
  }
}

export const authorize = (permission: Permission) => (
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
) => {
  if (req.actor?.permissions.includes(permission)) {
    return next();
  }

  return res.status(403).json({
    error: 'FORBIDDEN',
    message: `Permission required: ${permission}`,
  });
};
