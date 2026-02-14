export interface AuthSession {
  user_id: number;
  username: string;
  logged_in: boolean;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: AuthSession;
}
