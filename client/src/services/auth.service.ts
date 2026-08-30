import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

export interface CurrentUser {
  id: number;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  exp: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(private httpClient: HttpClient) {
    this._currentUser.set(this.decodeStoredToken());
  }

  private userBaseUrl: string = "http://localhost:3000/api/users";
  private tokenKey = 'authToken';

  private _currentUser = signal<CurrentUser | null>(null);
  readonly currentUser = this._currentUser.asReadonly();

  login(credentials: { email: string; password: string }) {
    return this.httpClient.post<{ message: string; token: string }>(`${this.userBaseUrl}/login`, credentials);
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
    this._currentUser.set(this.decodeToken(token));
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  // Also self-heals: a stored-but-expired token is cleared as a side effect of checking,
  // so guards never have to reason about "logged in but stale" as a separate state.
  isLoggedIn(): boolean {
    const user = this._currentUser();
    if (!user) return false;
    if (user.exp * 1000 < Date.now()) {
      this.logout();
      return false;
    }
    return true;
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this._currentUser.set(null);
  }

  homePathForRole(role: string): string {
    switch (role) {
      case 'admin': return '/admin';
      case 'teacher': return '/teacher';
      case 'student': return '/student';
      default: return '/login';
    }
  }

  private decodeStoredToken(): CurrentUser | null {
    const token = this.getToken();
    return token ? this.decodeToken(token) : null;
  }

  private decodeToken(token: string): CurrentUser | null {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch {
      return null;
    }
  }

}
