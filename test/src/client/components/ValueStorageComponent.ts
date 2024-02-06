import { Component } from "@flamework/components";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";
import { Subscribe } from "../../source/decorators";
import { OnStart } from "@flamework/core";

@Component({
	tag: "ValueStorageComponent",
})
export class ClientValueStorageComponent extends ValueStorageComponent implements OnStart {

	onStart(): void {
		task.delay(1, () => {
			print(this.testServerMethod(1, "4"));
		});
	}

	public destroy(): void {
		super.destroy();
		print("client destroy");
	}

	@Subscribe((state) => state.value)
	private onIncrement(newValue: number) {
		print(`new value: ${newValue}`);
	}
}
