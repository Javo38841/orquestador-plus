import { Component } from '@angular/core';

/** Surface container with the theme border. */
@Component({
  selector: 'app-card',
  template: `<div class="rounded-lg border border-line bg-surface p-4" data-testid="card">
    <ng-content />
  </div>`,
})
export class Card {}
