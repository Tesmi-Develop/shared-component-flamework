import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";

@Component({
	tag: "ValueStorageComponent",
})
export class ServerValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart() {
		this.remotes.IncrementByClient.Connect((player, amount) => {
			print(`incrementing by ${amount}, player: ${player}`);
		});

		this.remotes.Increment.OnRequest((amount) => {
			print(`Action: incrementing by ${amount}`);
		});

		task.wait(math.random(5, 10));
		this.remotes.IncrementByServer.Broadcast(1);
	}
}
