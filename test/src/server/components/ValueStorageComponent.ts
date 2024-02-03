import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";
import { Action } from "../../source/decorators";

@Component({
	tag: "ValueStorageComponent",
})
export class ServerValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart(): void {
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
