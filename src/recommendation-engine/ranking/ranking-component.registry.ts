import { Injectable } from '@nestjs/common';
import { RankingComponent } from './components/ranking-component.interface';

@Injectable()
export class RankingComponentRegistry {
  private readonly components = new Map<string, RankingComponent>();

  register(component: RankingComponent): void {
    if (this.components.has(component.key)) {
      throw new Error(
        `RankingComponent with key '${component.key}' is already registered.`,
      );
    }
    this.components.set(component.key, component);
  }

  getAll(): RankingComponent[] {
    return Array.from(this.components.values());
  }

  get(key: string): RankingComponent | undefined {
    return this.components.get(key);
  }
}
