import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-teacher-home',
  imports: [CommonModule],
  template: `
    <div style="padding: 2rem;">
      <h1>Teacher Dashboard</h1>
      <p>Logged in as {{ authService.currentUser()?.email }}</p>
      <p>Classes: {{ classes()?.length ?? '...' }}</p>
      <button (click)="logout()">Log out</button>
    </div>
  `,
})
export class TeacherHomeComponent implements OnInit {
  // Fetches through Angular's HttpClient (not raw fetch) specifically so this exercises
  // the real interceptor pipeline - authInterceptor attaching the bearer token, and
  // errorInterceptor reacting if the backend ever says the session is dead (401).
  classes = signal<unknown[] | null>(null);

  constructor(
    public authService: AuthService,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.http.get<{ classes: unknown[] }>('http://localhost:3000/api/class').subscribe({
      next: (res) => this.classes.set(res.classes),
      error: () => this.classes.set([]),
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
