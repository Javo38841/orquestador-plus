import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { WikiMode } from './wiki-mode';

@Component({ template: '' })
class Blank {}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'wiki', component: Blank },
        { path: 'tasks', component: Blank },
        { path: 'today', component: Blank },
      ]),
    ],
  });
  return { mode: TestBed.inject(WikiMode), router: TestBed.inject(Router) };
}

describe('WikiMode', () => {
  it('is active only on the wiki route', async () => {
    const { mode, router } = setup();
    await router.navigateByUrl('/tasks');
    expect(mode.active()).toBe(false);
    await router.navigateByUrl('/wiki');
    expect(mode.active()).toBe(true);
  });

  it('CP-08-30: exit goes back to the screen the wiki was entered from', async () => {
    const { mode, router } = setup();
    await router.navigateByUrl('/tasks');
    await router.navigateByUrl('/wiki');
    mode.exit();
    await vi.waitFor(() => expect(router.url).toBe('/tasks'));
    expect(mode.active()).toBe(false);
  });
});
