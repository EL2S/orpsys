from django.test import TestCase
from django.urls import reverse


class LoginViewTests(TestCase):
    def test_login_page_renders(self):
        response = self.client.get(reverse("login"))
        self.assertEqual(response.status_code, 200)

    def test_login_invalid_credentials_shows_error(self):
        response = self.client.post(
            reverse("login"),
            {
                "type": "saisit",
                "username": "fake-user",
                "password": "wrong-pass",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Nom d'utilisateur")
