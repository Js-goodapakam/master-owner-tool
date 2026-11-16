import { api } from './api';

export type SignupRequestRow = {
  /** Unique id of the signup request (used for Proceed / Delete and React keys). */
  id: string;
  /** Customer / business name shown in the queue and prefilled as "Business Name". */
  name: string;
  /** Business email shown in the queue and prefilled as "Business Email ID". */
  email: string;
  /** Mobile number shown in the queue and prefilled as "Mobile Number". */
  mobile: string;
  /** Optional signup date as YYYY-MM-DD (or an ISO timestamp). Defaults to today. */
  signupDate?: string;
  /** False for temporary unverified registration leads; never treat as verified. */
  emailVerified?: boolean;
};

/**
 * Load the signup requests waiting for onboarding.
 * Includes both verified signups and temporary unverified registration leads.
 * Consumer UI must retain emailVerified=false until ownership is confirmed.
 * Never return or store the signup password or raw OTP values.
 */
export async function listSignupRequests(): Promise<SignupRequestRow[]> {
  return api<SignupRequestRow[]>('/signup-requests');
}

/** Delete one signup request. Must reject (throw) if the backend refuses. */
export async function deleteSignupRequest(id: string): Promise<void> {
  await api<void>(`/signup-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
