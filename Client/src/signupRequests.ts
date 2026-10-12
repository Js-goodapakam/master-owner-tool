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
};

/**
 * Load the signup requests waiting for onboarding.
 * Only signups whose OTP verification already succeeded should be returned, so the
 * queue does not show any verified / pending status.
 * Never return or store the signup password or raw OTP values.
 */
export async function listSignupRequests(): Promise<SignupRequestRow[]> {
  return api<SignupRequestRow[]>('/signup-requests');
}

/** Delete one signup request. Must reject (throw) if the backend refuses. */
export async function deleteSignupRequest(id: string): Promise<void> {
  await api<void>(`/signup-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
