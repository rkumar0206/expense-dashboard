import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable, combineLatest, map, firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { LocalDbService } from './local-db.service';
import {
  Expense,
  ExpenseCategory,
  PaymentMethod,
  FormattedExpense,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_PAYMENT_METHOD_MAP,
} from '../models/expense.model';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private localDb = inject(LocalDbService);

  // Local state subjects backed by IndexedDB
  expenses$ = new BehaviorSubject<Expense[]>([]);
  categories$ = new BehaviorSubject<ExpenseCategory[]>([]);
  paymentMethods$ = new BehaviorSubject<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS);

  public isSyncing$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.authService.user$.subscribe((user) => {
      if (user) {
        this.syncAllData(user.uid);
      } else {
        this.expenses$.next([]);
        this.categories$.next([]);
        this.paymentMethods$.next(DEFAULT_PAYMENT_METHODS);
      }
    });
  }

  /**
   * Main sync coordinator
   */
  async syncAllData(uid: string): Promise<void> {
    // 1. Render cached local data immediately
    await this.loadFromLocalDb();

    // 2. Perform delta sync & count verification in parallel
    await Promise.all([
      this.syncExpensesDelta(uid),
      this.syncCategoriesDelta(uid),
      this.syncPaymentMethods(uid),
    ]);

    // 3. Emit updated state to RxJS streams
    await this.loadFromLocalDb();
  }

  /**
   * Public manual sync trigger usable by any component
   */
  async triggerManualSync(): Promise<void> {
    // Obtain the current user snapshot safely from user$ stream
    const user = await firstValueFrom(this.authService.user$);
    if (!user?.uid) return;

    this.isSyncing$.next(true);
    try {
      await this.syncAllData(user.uid);
    } catch (error) {
      console.error('Manual sync failed:', error);
    } finally {
      this.isSyncing$.next(false);
    }
  }

  /**
   * Reads local IndexedDB tables into state subjects
   */
  private async loadFromLocalDb(): Promise<void> {
    const expenses = await this.localDb.db.expenses.orderBy('created').reverse().toArray();
    const categories = await this.localDb.db.categories.toArray();
    const dbPaymentMethods = await this.localDb.db.paymentMethods.toArray();

    // Merge default payment methods with local IndexedDB records
    const mergedPaymentMap = new Map<string, PaymentMethod>();
    DEFAULT_PAYMENT_METHODS.forEach((item) => mergedPaymentMap.set(item.key, item));
    dbPaymentMethods.forEach((item) => mergedPaymentMap.set(item.key, item));

    this.expenses$.next(expenses);
    this.categories$.next(categories);
    this.paymentMethods$.next(Array.from(mergedPaymentMap.values()));
  }

  /**
   * Sync Expenses (Delta update + Smart Delete Reconciliation)
   */
  private async syncExpensesDelta(uid: string): Promise<void> {
    const ref = collection(this.firestore, 'Expenses');
    const userQuery = query(ref, where('uid', '==', uid));

    // 1. Delta Sync for new or updated expenses
    const lastSync = await this.localDb.getMaxModifiedTimestamp('expenses');
    const deltaQuery = query(ref, where('uid', '==', uid), where('modified', '>', lastSync));
    const deltaSnapshot = await getDocs(deltaQuery);
    const deltas = deltaSnapshot.docs.map((doc) => ({ ...doc.data(), key: doc.id }) as Expense);

    if (deltas.length > 0) {
      await this.localDb.upsertExpenses(deltas);
    }

    // 2. Count Check for Hard Deletes (1 Read Cost)
    const localCount = await this.localDb.db.expenses.count();
    const countSnapshot = await getCountFromServer(userQuery);
    const remoteCount = countSnapshot.data().count;

    console.log("expenses -> localCount", localCount);
    console.log("expenses -> remoteCount", remoteCount);

    // Trigger key purge only when local storage holds deleted/orphaned items
    if (localCount > remoteCount) {
      const allDocsSnapshot = await getDocs(userQuery);
      const remoteKeys = new Set(allDocsSnapshot.docs.map((doc) => doc.id));

      const localExpenses = await this.localDb.db.expenses.toArray();
      const orphanedKeys = localExpenses.filter((e) => !remoteKeys.has(e.key)).map((e) => e.key);

      if (orphanedKeys.length > 0) {
        await this.localDb.db.expenses.bulkDelete(orphanedKeys);
      }
    }
  }

  /**
   * Sync Categories (Delta update + Smart Delete Reconciliation)
   */
  private async syncCategoriesDelta(uid: string): Promise<void> {
    const ref = collection(this.firestore, 'ExpenseCategories');
    const userQuery = query(ref, where('uid', '==', uid));

    // 1. Delta Sync
    const lastSync = await this.localDb.getMaxModifiedTimestamp('categories');
    const deltaQuery = query(ref, where('uid', '==', uid), where('modified', '>', lastSync));
    const deltaSnapshot = await getDocs(deltaQuery);
    const deltas = deltaSnapshot.docs.map(
      (doc) => ({ ...doc.data(), key: doc.id }) as ExpenseCategory,
    );

    if (deltas.length > 0) {
      await this.localDb.upsertCategories(deltas);
    }

    // 2. Count Check for Hard Deletes
    const localCount = await this.localDb.db.categories.count();
    const countSnapshot = await getCountFromServer(userQuery);
    const remoteCount = countSnapshot.data().count;

    console.log('categories -> localCount', localCount);
    console.log('categories -> remoteCount', remoteCount);

    if (localCount > remoteCount) {
      const allDocsSnapshot = await getDocs(userQuery);
      const remoteKeys = new Set(allDocsSnapshot.docs.map((doc) => doc.id));

      const localCategories = await this.localDb.db.categories.toArray();
      const orphanedKeys = localCategories.filter((c) => !remoteKeys.has(c.key)).map((c) => c.key);

      if (orphanedKeys.length > 0) {
        await this.localDb.db.categories.bulkDelete(orphanedKeys);
      }
    }
  }

  /**
   * Sync Payment Methods (Full sync + Smart Delete Reconciliation)
   */
  private async syncPaymentMethods(uid: string): Promise<void> {
    const ref = collection(this.firestore, 'PaymentMethods');
    const userQuery = query(ref, where('uid', '==', uid));

    const snapshot = await getDocs(userQuery);
    const items = snapshot.docs.map((doc) => ({ ...doc.data(), key: doc.id }) as PaymentMethod);

    const remoteKeys = new Set(items.map((i) => i.key));
    const localMethods = await this.localDb.db.paymentMethods.toArray();
    const orphanedKeys = localMethods.filter((m) => !remoteKeys.has(m.key)).map((m) => m.key);

    if (items.length > 0) {
      await this.localDb.upsertPaymentMethods(items);
    }

    if (orphanedKeys.length > 0) {
      await this.localDb.db.paymentMethods.bulkDelete(orphanedKeys);
    }
  }

  /**
   * Joined formatted stream for templates & charts
   */
  getFormattedExpenses(): Observable<FormattedExpense[]> {
    return combineLatest([this.expenses$, this.categories$, this.paymentMethods$]).pipe(
      map(([expenses, categories, paymentMethods]) => {
        const categoryMap = new Map(categories.map((c) => [c.key, c.categoryName]));
        const paymentMap = new Map(paymentMethods.map((p) => [p.key, p.paymentMethod]));

        return expenses.map((expense) => {
          const keys: string[] = (expense as any).paymentMethodKeys || expense.paymentMethods || [];

          return {
            ...expense,
            categoryName: categoryMap.get(expense.categoryKey) || 'Uncategorized',
            paymentMethodNames: keys.map(
              (key) => paymentMap.get(key) || DEFAULT_PAYMENT_METHOD_MAP.get(key) || 'Unknown',
            ),
          };
        });
      }),
    );
  }
}
