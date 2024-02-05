import { Dependency, Flamework } from "@flamework/core";
import { SharedComponentHandler } from "../index";
import("../index");

Flamework.addPaths("test/src/client/components");
Flamework.addPaths("test/src/shared/components");
Flamework.ignite();
Dependency<SharedComponentHandler>().AttachReflexDevTools();
