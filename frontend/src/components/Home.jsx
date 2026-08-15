// my-YBO-app/src/components/Home.jsx - This component renders the home page, which includes the user search and feed components

import Feed from "../components/Feed";
import UserSearch from "../components/UserSearch";

function Home() {
  return (
    <>
      <UserSearch />
      <Feed />
    </>
  );
}

export default Home;