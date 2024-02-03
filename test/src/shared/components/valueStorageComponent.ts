import { Component } from "@flamework/components";
import { SharedComponent } from "../../source/shared-component";

interface State {
	value: number;
}

@Component()
export class ValueStorageComponent extends SharedComponent<State> {
	protected state = {
		value: 0,
	};
}
