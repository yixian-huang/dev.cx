import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import DesignSystemPage from "../pages/design-system/page";
import HandleRoute from "./HandleRoute";
import ProjectPage from "../pages/project/page";
import ThreadPage from "../pages/thread/page";
import ComposePage from "../pages/compose/page";
import OnboardingPage from "../pages/onboarding/page";
import FeedPage from "../pages/feed/page";
import ExplorePage from "../pages/explore/page";
import AboutPage from "../pages/about/page";
import NotificationsPage from "../pages/notifications/page";
import MePage from "../pages/me/page";
import MyProjectsPage from "../pages/me/projects/page";
import StatusPage from "../pages/me/status/page";
import EditProfilePage from "../pages/me/profile/page";
import MyDraftsPage from "../pages/me/drafts/page";
import WeeklyPage from "../pages/weekly/page";
import ProjectSettingsPage from "../pages/project/settings/page";
import NewProjectPage from "../pages/new-project/page";
import GuidelinesPage from "../pages/guidelines/page";
import PrivacyPage from "../pages/privacy/page";
import TermsPage from "../pages/terms/page";
import LoginPage from "../pages/login/page";
import AdminPage from "../pages/admin/page";
import VerifyEmailPage from "../pages/verify-email/page";
import ResetPasswordPage from "../pages/reset-password/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/p/:id",
    element: <ProjectPage />,
  },
  {
    path: "/p/:id/settings",
    element: <ProjectSettingsPage />,
  },
  {
    path: "/new-project",
    element: <NewProjectPage />,
  },
  {
    path: "/t/:id",
    element: <ThreadPage />,
  },
  {
    path: "/new",
    element: <ComposePage />,
  },
  {
    path: "/compose",
    element: <ComposePage />,
  },
  {
    path: "/onboarding",
    element: <OnboardingPage />,
  },
  {
    path: "/feed",
    element: <FeedPage />,
  },
  {
    path: "/explore",
    element: <ExplorePage />,
  },
  {
    path: "/about",
    element: <AboutPage />,
  },
  {
    path: "/guidelines",
    element: <GuidelinesPage />,
  },
  {
    path: "/privacy",
    element: <PrivacyPage />,
  },
  {
    path: "/terms",
    element: <TermsPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/notifications",
    element: <NotificationsPage />,
  },
  {
    path: "/me",
    element: <MePage />,
  },
  {
    path: "/me/projects",
    element: <MyProjectsPage />,
  },
  {
    path: "/me/status",
    element: <StatusPage />,
  },
  {
    path: "/me/drafts",
    element: <MyDraftsPage />,
  },
  {
    path: "/me/profile",
    element: <EditProfilePage />,
  },
  {
    path: "/design-system",
    element: <DesignSystemPage />,
  },
  {
    path: "/admin",
    element: <AdminPage />,
  },
  {
    path: "/weekly/:weekNumber",
    element: <WeeklyPage />,
  },
  {
    path: "/verify-email",
    element: <VerifyEmailPage />,
  },
  {
    path: "/reset-password",
    element: <ResetPasswordPage />,
  },
  {
    path: "/:handleParam",
    element: <HandleRoute />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;