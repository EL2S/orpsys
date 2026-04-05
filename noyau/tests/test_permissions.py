from django.contrib.auth.models import Permission, User
from django.test import TestCase
from django.urls import reverse

from noyau.models import Employer


class PermissionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="user1",
            password="test-pass-123",
            first_name="Jean",
            last_name="Dupont",
        )
        Employer.objects.create(user=self.user, role="Admin", badge_id="BADGE001")

    def test_dashboard_requires_login(self):
        response = self.client.get(reverse("view_dashboard"))
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("login"), response["Location"])

    def test_dashboard_returns_403_without_permission(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("view_dashboard"))
        self.assertEqual(response.status_code, 403)

    def test_dashboard_returns_200_with_permission(self):
        perm = Permission.objects.get(codename="view_dashboard")
        self.user.user_permissions.add(perm)
        self.client.force_login(self.user)
        response = self.client.get(reverse("view_dashboard"))
        self.assertEqual(response.status_code, 200)
