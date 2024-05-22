import { Component } from "@flamework/components";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";
import { OnStart } from "@flamework/core";

@Component({
	tag: "ValueStorageComponent",
})
export class ClientValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart(): void {
		this.remotes.IncrementByServer.Connect((amount: number) => {
			print(`incrementing by ${amount}`);
		});
		this.remotes.IncrementByClient.Fire(1);
		this.remotes.Increment(1);
	}
}
