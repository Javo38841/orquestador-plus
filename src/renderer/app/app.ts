import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppInfoStore } from './core/app-info.store';
import { NAVIGATION } from './layout/navigation';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(AppInfoStore);
  protected readonly navigation = NAVIGATION;
}
