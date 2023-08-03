declare global {
    interface Array<T> {
        /**
         * Removes all items from the array that match the predicate.
         */
        remove(predicate: (item: T) => boolean): T[];
        replace(predicate: (item: T) => boolean, ...items: T[]): T[];
    }
};

/**
 * Removes all items from the array that match the predicate.
 */
Array.prototype.remove = function <T>(predicate: (item: T) => boolean): T[] {
    const removed: T[] = [];
    for (let i = this.length - 1; i >= 0; i--) {
        if (predicate(this[i])) {
            removed.push(this[i]);
            this.splice(i, 1);
        }
    }
    return removed.reverse();
};

Array.prototype.replace = function <T>(predicate: (item: T) => boolean, ...items: T[]): T[] {
    const removed = this.remove(predicate);
    this.push(...items);
    return removed;
};

export { };