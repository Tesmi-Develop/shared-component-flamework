import { Component } from "@flamework/components";
import { SharedComponent } from "../../source/shared-component";
import { ServerMethod, SharedSubscribe } from "../../source/decorators";

interface State {
	value: number;
}

@Component()
export class ValueStorageComponent extends SharedComponent<State> {
	protected state = {
		value: 0,
	};

	@ServerMethod()
	protected testServerMethod(arg: number, arg2: string): string {
		return "123";
	}

	@SharedSubscribe("Both", (state) => state.value)
	private onChange(val: number) {
		print("shared ", val);
	}
}
