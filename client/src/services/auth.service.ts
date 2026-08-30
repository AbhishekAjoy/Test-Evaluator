import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';

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

  constructor(private httpClient: HttpClient) {}

  private userBaseUrl: string = "http://localhost:3000/api/users";

  // The access token is short-lived (15m) by design and is held in memory only - never
  // localStorage, never any JS-readable storage. It doesn't survive a reload; that's
  // expected, not a bug. tryRestoreSession() (called once at app boot, see
  // app.config.ts) re-derives it from the httpOnly refresh cookie, which does survive a
  // reload since the browser manages it, not this service.
  private _accessToken = signal<string | null>(null);
  private _currentUser = signal<CurrentUser | null>(null);
  readonly currentUser = this._currentUser.asReadonly();

  // Shared/deduped: if several requests 401 around the same moment, every one of them
  // ends up calling refresh() - without this they'd each fire their own HTTP call (and,
  // since the refresh token rotates, their own rotation), which is wasteful and only
  // avoids looking broken because the backend's reuse grace window happens to forgive
  // near-simultaneous rotations. Sharing one in-flight call is the actual fix.
  private refreshInProgress$: Observable<string> | null = null;

  login(credentials: { email: string; password: string }) {
    return this.httpClient
      .post<{ message: string; token: string }>(`${this.userBaseUrl}/login`, credentials, { withCredentials: true })
      .pipe(tap((res) => this.setAccessToken(res.token)));
  }

  // Called once at app boot to silently restore a session from the refresh cookie, if
  // one exists. Never throws - no cookie (a first-time or fully logged-out visitor) is a
  // normal outcome, not an error, so it resolves to false rather than rejecting.
  tryRestoreSession(): Observable<boolean> {
    return this.refresh().pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  refresh(): Observable<string> {
    if (this.refreshInProgress$) return this.refreshInProgress$;

    this.refreshInProgress$ = this.httpClient
      .post<{ token: string }>(`${this.userBaseUrl}/refresh`, {}, { withCredentials: true })
      .pipe(
        map((res) => res.token),
        tap((token) => this.setAccessToken(token)),
        catchError((err) => {
          this.clearSession();
          return throwError(() => err);
        }),
        shareReplay(1),
        finalize(() => {
          this.refreshInProgress$ = null;
        })
      );
    return this.refreshInProgress$;
  }

  // Revokes the refresh token server-side. Fire-and-forget from the caller's
  // perspective (matches how the dashboard "log out" buttons already call this) - the
  // user is logged out client-side immediately regardless of whether the network call
  // to actually revoke it succeeds.
  logout(): void {
    this.httpClient.post(`${this.userBaseUrl}/logout`, {}, { withCredentials: true }).subscribe({
      error: (err) => console.error('Server-side logout failed:', err),
    });
    this.clearSession();
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  // Also self-heals: a stale in-memory token past its own exp is cleared as a side
  // effect of checking, so guards never have to reason about "logged in but expired" as
  // a separate state.
  isLoggedIn(): boolean {
    const user = this._currentUser();
    if (!user) return false;
    if (user.exp * 1000 < Date.now()) {
      this.clearSession();
      return false;
    }
    return true;
  }

  homePathForRole(role: string): string {
    switch (role) {
      case 'admin': return '/admin';
      case 'teacher': return '/teacher';
      case 'student': return '/student';
      default: return '/login';
    }
  }

  private setAccessToken(token: string): void {
    this._accessToken.set(token);
    this._currentUser.set(this.decodeToken(token));
  }

  private clearSession(): void {
    this._accessToken.set(null);
    this._currentUser.set(null);
  }

  private decodeToken(token: string): CurrentUser | null {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch {
      return null;
    }
  }

}
