from django.test import Client, TestCase
from django.urls import reverse


class ErrorPageTests(TestCase):
    def test_custom_404_page(self):
        response = self.client.get("/page-introuvable/")
        self.assertEqual(response.status_code, 404)
        self.assertContains(response, "Page introuvable")

    def test_csrf_failure_page(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post(
            reverse("login"),
            {
                "type": "saisit",
                "username": "fake-user",
                "password": "wrong-pass",
            },
        )
        self.assertEqual(response.status_code, 403)
        self.assertContains(response, "jeton de sécurité")
