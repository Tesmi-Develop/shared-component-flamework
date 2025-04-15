import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { Subscribe } from "@rbxts/shared-components-flamework";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";

@Component({
	tag: "ValueStorageComponent",
})
export class ClientValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart(): void {
		this.Subscribe((state) => {
			print(state);
		});
	}
	@Subscribe((state) => state.value)
	private onIncrement(newValue: number) {
		print(`new value: ${newValue}`);
	}
}
