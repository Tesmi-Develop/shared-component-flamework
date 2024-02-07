import { Component, Components } from "@flamework/components";
import { Dependency, OnStart } from "@flamework/core";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";
import { Action } from "../../source/decorators";

@Component({
	tag: "ValueStorageComponent",
})
export class ServerValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart(): void {
		task.spawn(() => {
			const instance = this.instance;
			let k = 0;
			while (task.wait(3) && k < 5) {
				this.increment();
				k++;
			}
			this.destroy();
		});
	}

	protected testServerMethod(arg: number, arg2: string) {
		print("server method", arg, arg2);
		return "Good";
	}

	public destroy(): void {
		super.destroy();
	}

	@Action()
	private increment() {
		return {
			...this.state,
			value: this.state.value + 1,
		};
	}
}
