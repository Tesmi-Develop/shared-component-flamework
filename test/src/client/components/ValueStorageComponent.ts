import { Component } from "@flamework/components";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";
import { Subscribe } from "../../source/decorators";

@Component({
	tag: "ValueStorageComponent",
})
export class ClientValueStorageComponent extends ValueStorageComponent {

	protected resolveOnDestroy(): "Keep" {
		return "Keep";
	}

	public destroy(): void {
		super.destroy();
		print('client destroy')
	}

	@Subscribe((state) => state.value)
	private onIncrement(newValue: number) {
		print(`new value: ${newValue}`);
	}
}
