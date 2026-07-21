import { Component, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, map, Observable } from 'rxjs';
import { NavTabsComponent } from '../../components/nav-tabs/nav-tabs.component';
import { ExpenseService } from '../../services/expense.service';
import { ExpenseCategory } from '../../models/expense.model';

export interface CategoryCardVM extends ExpenseCategory {
  totalAmount: number;
  expenseCount: number;
}

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, RouterLink, NavTabsComponent],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.scss',
})
export class CategoriesComponent {
  protected expenseService = inject(ExpenseService);

  onSync(): void {
    this.expenseService.triggerManualSync();
  }

  categoryStats$: Observable<CategoryCardVM[]> = combineLatest([
    this.expenseService.categories$,
    this.expenseService.expenses$,
  ]).pipe(
    map(([categories, expenses]) => {
      return (
        categories
          .map((cat) => {
            const categoryExpenses = expenses.filter((e) => e.categoryKey === cat.key);
            const totalAmount = categoryExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

            return {
              ...cat,
              totalAmount,
              expenseCount: categoryExpenses.length,
            };
          })
          // Sort by modified timestamp: Most recently modified first (Descending)
          .sort((a, b) => (b.modified || 0) - (a.modified || 0))
      );
    }),
  );
}
