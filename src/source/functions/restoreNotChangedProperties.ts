export function restoreNotChangedProperties<T extends object, C extends object>(table1: T, table2: C): T | C {
	let isDifferentObjects = false;
	const clone = table.clone(table2) as Map<unknown, unknown>;

	for (const [index, value] of pairs(table1)) {
		const originalValue = table2[index as keyof C];
		clone[index as never] = undefined as never;

		if (typeIs(value, "table") && typeIs(originalValue, "table")) {
			const newObject = restoreNotChangedProperties(value, originalValue);
			if (newObject !== originalValue) {
				isDifferentObjects = true;
				continue;
			}
			table1[index as keyof T] = newObject as never;
			continue;
		}

		if (originalValue !== value) {
			isDifferentObjects = true;
			continue;
		}
	}

	isDifferentObjects = isDifferentObjects ? isDifferentObjects : !clone.isEmpty();

	return isDifferentObjects ? table1 : table2;
}
