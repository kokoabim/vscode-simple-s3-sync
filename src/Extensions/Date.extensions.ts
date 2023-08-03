declare global {
    interface Date {
        /**
         * Formats a date using the specified format string.
         * @param format The format string.
         *  - yyyy: The year, such as 2023.
         *  - yy: The year, such as 23.
         *  - MM: The month, such as 01.
         *  - M: The month, such as 1.
         *  - dd: The day, such as 01.
         *  - d: The day, such as 1.
         *  - HH: The hour, such as 01.
         *  - H: The hour, such as 1.
         *  - hh: The hour, such as 01.
         *  - h: The hour, such as 1.
         *  - mm: The minute, such as 01.
         *  - m: The minute, such as 1.
         *  - ss: The second, such as 01.
         *  - s: The second, such as 1.
         *  - fff: The millisecond, such as 001.
         *  - f: The millisecond, such as 1.
         *  - tt: The AM/PM designator, such as AM.
         *  - t: The AM/PM designator, such as A.
         *  - All other characters are copied to the result string unchanged.
         */
        format(format: string): string;
    }
}

Date.prototype.format = function (format: string): string {
    const date = this;
    const hour = date.getHours();
    return format.replace(/(yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|fff|f|tt|t)/g, function (key) {
        switch (key) {
            case 'yyyy': return date.getFullYear().toString();
            case 'yy': return date.getFullYear().toString().substring(2);
            case 'MM': return (date.getMonth() + 1).toString().padStart(2, '0');
            case 'M': return (date.getMonth() + 1).toString();
            case 'dd': return date.getDate().toString().padStart(2, '0');
            case 'd': return date.getDate().toString();
            case 'HH': return hour.toString().padStart(2, '0');
            case 'H': return hour.toString();
            case 'hh': return (hour === 0 ? 12 : hour > 12 ? hour - 12 : hour).toString().padStart(2, '0');
            case 'h': return (hour === 0 ? 12 : hour > 12 ? hour - 12 : hour).toString();
            case 'mm': return date.getMinutes().toString().padStart(2, '0');
            case 'm': return date.getMinutes().toString();
            case 'ss': return date.getSeconds().toString().padStart(2, '0');
            case 's': return date.getSeconds().toString();
            case 'fff': return date.getMilliseconds().toString().padStart(3, '0');
            case 'f': return date.getMilliseconds().toString();
            case 'tt': return hour < 12 ? 'AM' : 'PM';
            case 't': return hour < 12 ? 'A' : 'P';
            default: return key;
        }
    });
};

export { };