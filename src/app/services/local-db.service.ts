import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Expense, ExpenseCategory, PaymentMethod } from '../models/expense.model';

export class ExpenseDatabase extends Dexie {
  expenses!: Table<Expense, string>; // Primary key is 'key'
  categories!: Table<ExpenseCategory, string>;
  paymentMethods!: Table<PaymentMethod, string>;

  constructor() {
    super('ExpenseDashboardDB');

    // Define schema and indexes
    this.version(1).stores({
      expenses: 'key, uid, created, modified, categoryKey',
      categories: 'key, uid, created, modified',
      paymentMethods: 'key, uid',
    });
  }
}

@Injectable({
  providedIn: 'root',
})
export class LocalDbService {
  public db = new ExpenseDatabase();

  // Helper to get highest modified timestamp stored locally
  async getMaxModifiedTimestamp(
    tableName: 'expenses' | 'categories',
  ): Promise<number> {
    const lastRecord = await this.db.table(tableName).orderBy('modified').last();
    return lastRecord?.modified || 0;
  }

  // Bulk save or update records locally
  async upsertExpenses(items: Expense[]): Promise<void> {
    if (items.length > 0) {
      await this.db.expenses.bulkPut(items);
    }
  }

  async upsertCategories(items: ExpenseCategory[]): Promise<void> {
    if (items.length > 0) {
      await this.db.categories.bulkPut(items);
    }
  }

  async upsertPaymentMethods(items: PaymentMethod[]): Promise<void> {
    if (items.length > 0) {
      await this.db.paymentMethods.bulkPut(items);
    }
  }
}
