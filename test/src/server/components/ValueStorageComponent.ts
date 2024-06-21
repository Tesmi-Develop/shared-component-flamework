import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { Action } from "@rbxts/reflex-class";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";

@Component({
	tag: "ValueStorageComponent",
})
export class ServerValueStorageComponent extends ValueStorageComponent implements OnStart {
	public onStart() {
		task.spawn(() => {
			while (task.wait(3)) {
				this.increment();
			}
		});
	}

	@Action()
	private increment() {
		return {
			...this.state,
			value: this.state.value + 1,
		};
	}
}
