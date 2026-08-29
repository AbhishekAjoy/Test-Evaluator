import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-admin-home',
  template: `
    <div style="padding: 2rem;">
      <h1>Admin Dashboard</h1>
      <p>Logged in as {{ authService.currentUser()?.email }}</p>
      <button (click)="logout()">Log out</button>
    </div>
  `,
})
export class AdminHomeComponent {
  constructor(public authService: AuthService, private router: Router) {}

  logout() {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
