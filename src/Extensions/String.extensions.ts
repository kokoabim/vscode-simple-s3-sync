declare global {
    interface String {
        ignoreCaseEquals(other: string | null | undefined): boolean;
    }
}

String.prototype.ignoreCaseEquals = function (other: string | null | undefined): boolean {
    return other ? this.toLowerCase() === other.toLowerCase() : false;
};

export { };