import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-nav-tabs',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: 'nav-tabs.component.html',
  styleUrls: ['nav-tabs.component.scss'],
})
export class NavTabsComponent {
  public authService = inject(AuthService);
}
