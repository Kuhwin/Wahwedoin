import { redirect } from "next/navigation";

// The all-projects list was moved to /all-projects. Redirect the old
// URL so bookmarks, links, and tests that still point at /projects
// continue to work.
export default function ProjectsIndexRedirect() {
  redirect("/all-projects");
}
