import { Component } from "@flamework/components";
import { SharedComponent } from "../../source/shared-component";
import { SharedSubscribe } from "../../source/decorators";

interface State {
	value: number;
}

@Component()
export class ValueStorageComponent extends SharedComponent<State> {
	protected state = {
		value: 0,
	};

	@SharedSubscribe("Both", (state) => state.value)
	private onChange(val: number) {
		print("shared ", val);
	}
}
