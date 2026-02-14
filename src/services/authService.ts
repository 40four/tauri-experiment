import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type {
  AuthSession,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
} from "@/types/auth";

let db: Database | null = null;

// Initialize database connection
async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:dashlens.db");
  }
  return db;
}

export class AuthService {
  // Hash a password using Rust Argon2
  private static async hashPassword(password: string): Promise<string> {
    const result = await invoke<{ hash: string }>("hash_password", { password });
    return result.hash;
  }

  // Verify a password using Rust Argon2
  private static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const result = await invoke<{ valid: boolean }>("verify_password", {
      request: { password, hash },
    });
    return result.valid;
  }

  // Register a new user
  static async register(request: RegisterRequest): Promise<AuthResponse> {
    try {
      // Validate input
      if (!request.username.trim()) {
        return {
          success: false,
          message: "Username cannot be empty",
          user: undefined,
        };
      }

      if (request.password.length < 8) {
        return {
          success: false,
          message: "Password must be at least 8 characters",
          user: undefined,
        };
      }

      const database = await getDb();

      // Check if user already exists
      const existingUsers = await database.select<Array<{ id: number }>>(
        "SELECT id FROM users WHERE username = $1",
        [request.username]
      );

      if (existingUsers.length > 0) {
        return {
          success: false,
          message: "Username already exists",
          user: undefined,
        };
      }

      // Hash the password
      const passwordHash = await this.hashPassword(request.password);

      // Insert the user
      const result = await database.execute(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
        [request.username, passwordHash]
      );

      // Get the inserted user's ID
      const userId = result.lastInsertId;

      // Create session
      const session: AuthSession = {
        user_id: userId,
        username: request.username,
        logged_in: true,
      };

      // Set session in Rust state
      await invoke("set_session", { session });

      return {
        success: true,
        message: "Registration successful",
        user: session,
      };
    } catch (error) {
      console.error("Registration error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Registration failed",
        user: undefined,
      };
    }
  }

  // Login a user
  static async login(request: LoginRequest): Promise<AuthResponse> {
    try {
      const database = await getDb();

      // Fetch user from database
      const users = await database.select<
        Array<{ id: number; username: string; password_hash: string }>
      >("SELECT id, username, password_hash FROM users WHERE username = $1", [
        request.username,
      ]);

      if (users.length === 0) {
        return {
          success: false,
          message: "Invalid credentials",
          user: undefined,
        };
      }

      const user = users[0];

      // Verify password
      const isValid = await this.verifyPassword(request.password, user.password_hash);

      if (!isValid) {
        return {
          success: false,
          message: "Invalid credentials",
          user: undefined,
        };
      }

      // Create session
      const session: AuthSession = {
        user_id: user.id,
        username: user.username,
        logged_in: true,
      };

      // Set session in Rust state
      await invoke("set_session", { session });

      return {
        success: true,
        message: "Login successful",
        user: session,
      };
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Login failed",
        user: undefined,
      };
    }
  }

  // Logout the current user
  static async logout(): Promise<AuthResponse> {
    try {
      await invoke("clear_session");
      return {
        success: true,
        message: "Logout successful",
        user: undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: "Logout failed",
        user: undefined,
      };
    }
  }

  // Get the current logged-in user
  static async getCurrentUser(): Promise<AuthSession | null> {
    try {
      return await invoke<AuthSession | null>("get_current_user");
    } catch (error) {
      console.error("Get current user error:", error);
      return null;
    }
  }

  // Check if user is authenticated
  static async checkAuthStatus(): Promise<boolean> {
    try {
      return await invoke<boolean>("check_auth_status");
    } catch (error) {
      console.error("Check auth status error:", error);
      return false;
    }
  }
}
