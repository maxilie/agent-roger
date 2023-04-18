import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/nextjs";
import { type NextPage } from "next";

import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TabsContent } from "@radix-ui/react-tabs";
import { Button } from "~/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";

const SaveFieldBtn = (props: {
  isSaving: boolean;
  dbValue: string;
  localValue: string;
  saveFn: () => Promise<void>;
}) => {
  if (
    !props.isSaving &&
    (props.localValue.length < 5 || props.localValue == props.dbValue)
  ) {
    return <></>;
  }
  return (
    <Button
      disabled={props.isSaving}
      variant="subtle"
      className="ml-3 font-mono text-lg text-emerald-900"
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      onClick={async () => {
        console.log("button clicked");
        await props.saveFn();
      }}
    >
      {props.isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {!props.isSaving && <CheckCircle className="mr-2 h-4 w-4" />}
      Save
    </Button>
  );
};

export type TabValue = "tasks" | "training_data";

const Header = () => {
  return (
    <div className=" flex flex-col justify-center bg-gray-900 bg-opacity-90 shadow-sm shadow-zinc-800 md:flex md:flex-row ">
      <div className="md:absolute md:right-10 md:mt-10 mdMax:relative mdMax:mb-4 mdMax:flex  mdMax:w-full mdMax:flex-row mdMax:justify-center mdMax:pt-4">
        <UserButton />
      </div>
      <div className="md:mx-auto md:my-6 mdMax:flex mdMax:w-full mdMax:flex-row mdMax:justify-center mdMax:pb-4">
        <TabsList className="md:p-3 mdMax:p-1">
          <TabsTrigger value="tasks" className="text-sm md:text-lg">
            Tasks
          </TabsTrigger>
          <TabsTrigger value="training_data" className="text-sm md:text-lg">
            Training Data
          </TabsTrigger>
        </TabsList>
      </div>
    </div>
  );
};

const Tasks = () => {
  return (
    <div className="m-2 flex w-full justify-center">
      <p className="text-xl">Tasks</p>
    </div>
  );
};

const TrainingData = () => {
  return (
    <div className="m-2 flex w-full justify-center">
      <p className="text-xl">Training Data</p>
    </div>
  );
};

const Dashboard: NextPage = () => {
  return (
    <div>
      <Tabs defaultValue="tasks">
        <Header />
        <TabsContent value="tasks">
          <Tasks />
        </TabsContent>
        <TabsContent value="training_data">
          <TrainingData />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Home: NextPage = () => {
  return (
    <div className="w-full">
      <SignedIn>
        <div className="w-full">
          <Dashboard />
        </div>
      </SignedIn>

      <SignedOut>
        <div className="flex h-full w-full justify-center pt-20 align-middle">
          <SignIn />
        </div>
      </SignedOut>
    </div>
  );
};

export default Home;
